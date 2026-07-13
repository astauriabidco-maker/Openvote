import json

REGION_CODE = {
    "ADAMAOUA": "AD", "CENTRE": "CE", "EST": "ES", "EXTREME-NORD": "EN",
    "LITTORAL": "LT", "NORD": "NO", "NORD-OUEST": "NW", "OUEST": "OU",
    "SUD": "SU", "SUD-OUEST": "SW", "DIASPORA": "DI",
}

clean_data = [
    ("ADAMAOUA", 278957, 223156, 197374, 1968, 502113, 1845),
    ("CENTRE", 807373, 624821, 476762, 5233, 1432194, 6002),
    ("EST", 214161, 163017, 119081, 1270, 377178, 1694),
    ("EXTREME-NORD", 630815, 594511, 412076, 7018, 1225326, 4547),
    ("LITTORAL", 736747, 538823, 420298, 3948, 1275570, 4164),
    ("NORD", 419187, 362252, 268533, 4635, 781439, 2696),
    ("NORD-OUEST", 287294, 333959, 185563, 2419, 621253, 2500),
    ("OUEST", 422975, 457415, 303609, 5008, 880390, 3195),
    ("SUD", 173433, 141124, 107990, 1201, 314557, 1703),
    ("SUD-OUEST", 219596, 189206, 108434, 1257, 408802, 1916),
    ("DIASPORA", 17419, 9381, 7601, 28, 26800, 95),
]
rows = []
for region, h, f, j, handi, total, bv in clean_data:
    rows.append({
        "region": REGION_CODE.get(region, region),
        "region_name": region,
        "hommes": h, "femmes": f, "jeunes": j, "handicapes": handi,
        "total": total, "bv": bv,
    })

regions_only = [r for r in rows if r["region"] != "DI"]
total_regions = {k: sum(r[k] for r in regions_only) for k in ("hommes","femmes","jeunes","handicapes","total","bv")}
total_regions.update({"region": "TOTAL-RX", "region_name": "TOTAL (Régions)"})
diaspora = next(r for r in rows if r["region"] == "DI")
total_national = {k: total_regions[k] + diaspora[k] for k in ("hommes","femmes","jeunes","handicapes","total","bv")}
total_national.update({"region": "TOTAL-NAT", "region_name": "TOTAL NATIONAL"})

print("Vraies données ELECAM (portail officiel, 2025, révision listes au 31/12/2024) :")
print("=" * 95)
print(f"{'Région':<15} {'BV':>8} {'Inscrits':>15} {'Hommes':>12} {'Femmes':>12} {'Jeunes':>10} {'Handicapés':>10}")
for r in sorted(regions_only, key=lambda x: x["region"]):
    print(f"  {r['region_name']:<13} {r['bv']:>8,} {r['total']:>15,} {r['hommes']:>12,} {r['femmes']:>12,} {r['jeunes']:>10,} {r['handicapes']:>10,}")
print(f"  {diaspora['region_name']:<13} {diaspora['bv']:>8,} {diaspora['total']:>15,} {diaspora['hommes']:>12,} {diaspora['femmes']:>12,} {diaspora['jeunes']:>10,} {diaspora['handicapes']:>10,}")
print(f"  {total_regions['region_name']:<13} {total_regions['bv']:>8,} {total_regions['total']:>15,} {total_regions['hommes']:>12,} {total_regions['femmes']:>12,} {total_regions['jeunes']:>10,} {total_regions['handicapes']:>10,}")
print(f"  {total_national['region_name']:<13} {total_national['bv']:>8,} {total_national['total']:>15,} {total_national['hommes']:>12,} {total_national['femmes']:>12,} {total_national['jeunes']:>10,} {total_national['handicapes']:>10,}")

old_pdf_data = {
    "ADAMAOUA": (14, 1561), "CENTRE": (33, 4080), "EST": (13, 1887),
    "EXTREME-NORD": (39, 5522), "LITTORAL": (15, 1813), "NORD": (16, 2236),
    "NORD-OUEST": (17, 1479), "OUEST": (22, 2446), "SUD": (16, 1906),
    "SUD-OUEST": (15, 1597),
}
print("\n" + "=" * 95)
print("DIFF ancien scrap PDF (200 BV / 24k ins.) vs portail officiel :")
print(f"{'Région':<15} {'PDF BV':>8} {'Vrai BV':>10} {'%PDF':>7}  {'PDF Ins.':>10} {'Vrai Ins.':>12} {'%PDF':>7}")
for r in sorted(regions_only, key=lambda x: x["region"]):
    rn = r["region_name"]
    old_bv, old_v = old_pdf_data.get(rn, (0, 0))
    pct_bv = (old_bv / r["bv"] * 100) if r["bv"] else 0
    pct_v = (old_v / r["total"] * 100) if r["total"] else 0
    print(f"  {rn:<13} {old_bv:>8} {r['bv']:>10,} {pct_bv:>6.2f}%  {old_v:>10,} {r['total']:>12,} {pct_v:>6.2f}%")
old_total_bv = sum(v[0] for v in old_pdf_data.values())
old_total_v = sum(v[1] for v in old_pdf_data.values())
print(f"  {'TOTAL':<13} {old_total_bv:>8} {total_national['bv']:>10,} {old_total_bv/total_national['bv']*100:>6.2f}%  {old_total_v:>10,} {total_national['total']:>12,} {old_total_v/total_national['total']*100:>6.2f}%")

output = {
    "source": "https://portail.elecam.cm/fr/statistiques-des-inscrits/ (scrapé 2026-07-13)",
    "periode": "Révision des listes électorales au 31 décembre 2024",
    "granularite": "Région (le portail n'expose PAS publiquement la liste par département/arrondissement/bureau)",
    "rows": rows,
    "totals": {"regions": total_regions, "national": total_national},
}
with open("data/geo/elecam-statistiques-inscrits.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print("\nSaved to data/geo/elecam-statistiques-inscrits.json")
