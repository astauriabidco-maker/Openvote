import pdfplumber
import json
import re

pdf_path = "/Users/user/Downloads/Liste des bureaux de vote (1).pdf"

def clean(s):
    if not s: return ""
    return re.sub(r'\s+', ' ', s).strip()

REGION_MAP = {
    "ADAMAOUA/A DAMAWA": "AD", "CENTRE": "CE", "EST/EAST": "ES",
    "EXTREME-NORD FAR NORTH": "EN", "EXTRÊME-NORD FAR NORTH": "EN",
    "LITTORAL": "LT", "LITTORAL\nLITTORAL": "LT",
    "NORD-OUEST NORTH-WEST": "NW", "NORD-OUEST\nNORTH-WEST": "NW",
    "NORD NORTH": "NO", "NORD\nNORTH": "NO",
    "OUEST WEST": "OU", "OUEST\nWEST": "OU",
    "SUD-OUEST SOUTH-WEST": "SW", "SUD SOUTH": "SU", "SUD\nSOUTH": "SU",
}

DEPT_MAP = {
    "DJEREM": "AD-DJ", "FARO ET DEO": "AD-FD", "FARO": "AD-FD",
    "MAYO-BANYO": "AD-MB", "MBERE": "AD-MR", "VINA": "AD-VI",
    "HAUTE-SANAGA": "CE-HS", "LEKIE": "CE-LK", "LEKIÉ": "CE-LK",
    "MBAM-ET-INOUBOU": "CE-MI", "MBAM-ET-KIM": "CE-MK",
    "MEFOU-ET-AFAMBA": "CE-MF", "MEFOU-ET-AKONO": "CE-MA",
    "MFOUNDI": "CE-MF", "NYONG-ET-KELLE": "CE-NK",
    "NYONG-ET-MFOUMOU": "CE-MM", "NYONG-ET-SOO": "CE-NS", "NYONG ET SO'O": "CE-NS",
    "BOUMBA-ET-NGOKO": "ES-BN", "BOUMBA ET NGOKO": "ES-BN",
    "HAUT-NYONG": "ES-HN", "KADEY": "ES-KD",
    "LOM-ET-DJEREM": "ES-LD", "LOM ET DJEREM": "ES-LD",
    "DIAMARE": "EN-DI", "LOGONE-ET-CHARI": "EN-LC", "LOGONE ET CHARI": "EN-LC",
    "MAYO-DANAY": "EN-MD", "MAYO DANAY": "EN-MD",
    "MAYO-KANI": "EN-MK", "MAYO KANI": "EN-MK",
    "MAYO-SAVA": "EN-MS", "MAYO SAVA": "EN-MS",
    "MAYO-TSANAGA": "EN-MT", "MAYO TSANAGA": "EN-MT",
    "MOUNGO": "LT-MO", "NKAM": "LT-NK",
    "SANAGA-MARITIME": "LT-SM", "SANAGA MARITIME": "LT-SM", "WOURI": "LT-WO",
    "BUI": "NW-BU", "BOYO": "NW-BO", "DONGA-MANTUNG": "NW-DM",
    "MENCHUM": "NW-MC", "MEZAM": "NW-MZ", "MOMO": "NW-MM", "NGO-KETUNJIA": "NW-NK",
    "BAMBOUTOS": "OU-BM", "HAUT-NKAM": "OU-HN", "HAUT NKAM": "OU-HN",
    "HAUTS-PLATEAUX": "OU-HP", "MENOUA": "OU-MN", "MIFI": "OU-MF",
    "NDE": "OU-ND", "NOUN": "OU-NN",
    "DJA-ET-LOBO": "SU-DL", "DJA ET LOBO": "SU-DL", "MVILA": "SU-MV",
    "OCEAN": "SU-OC", "VALLEE-DU-NTEM": "SU-VN", "VALLEE DU NTEM": "SU-VN",
    "FAKO": "SW-FA", "KUPE-MANENGUBA": "SW-KM", "LEBIALEM": "SW-LE",
    "MANYU": "SW-MA", "MEME": "SW-ME", "NDIAN": "SW-ND",
    "BENOUE": "NO-BE", "BÉNOUÉ": "NO-BE",
    "FARO": "NO-FA",
    "MAYO LOUTI": "NO-ML", "MAYO-REY": "NO-MR", "MAYO REY": "NO-MR",
}

all_rows = []
all_totals = []

def detect_offsets(t):
    valid = []
    if not t or len(t) < 2: return valid
    header_str = " ".join(str(c) for c in t[0] if c).upper()
    if "REGION" not in header_str:
        return valid
    n_cols = max(len(r) for r in t if r)
    for col_offset in range(0, n_cols - 3):
        matches = 0
        for row in t[1:]:
            if not row or not any(c for c in row if c):
                continue
            while len(row) < col_offset + 5:
                row.append(None)
            region, dept, effectif, bureau, count = row[col_offset:col_offset+5]
            region_clean = clean(region).upper() if region else ""
            dept_clean = clean(dept).upper() if dept else ""
            if region_clean in REGION_MAP and dept_clean in DEPT_MAP:
                matches += 1
        if matches >= 1:
            valid.append(col_offset)
    return valid

def parse_table(t, pnum, allowed_offsets):
    if not t or len(t) < 2: return
    for col_offset in allowed_offsets:
        current_region = None
        current_dept = None
        current_effectif = None
        for row in t[1:]:
            if not row or not any(c for c in row if c):
                continue
            while len(row) < col_offset + 5:
                row.append(None)
            region, dept, effectif, bureau_name, count = row[col_offset:col_offset+5]
            if region and region.strip():
                r_clean = clean(region).upper()
                mapped = REGION_MAP.get(r_clean)
                if mapped:
                    current_region = mapped
            if dept and dept.strip():
                d_clean = clean(dept).upper()
                mapped = DEPT_MAP.get(d_clean)
                if mapped:
                    current_dept = mapped
            if effectif and effectif.strip():
                current_effectif = clean(effectif)
            if bureau_name and bureau_name.strip():
                bn = clean(bureau_name)
                if bn.lower().startswith("total") or ("total" in bn.lower() and "électeur" in bn.lower()):
                    continue
                cnt_str = clean(count)
                voters = None
                if cnt_str.isdigit():
                    voters = int(cnt_str)
                elif cnt_str:
                    digits = re.sub(r"[^\d]", "", cnt_str)
                    if digits:
                        voters = int(digits)
                if current_region and current_dept and bn and voters is not None:
                    all_rows.append({
                        "region": current_region,
                        "dept": current_dept,
                        "effectif": current_effectif,
                        "bureau": bn,
                        "voters": voters,
                        "page": pnum,
                    })

with pdfplumber.open(pdf_path) as pdf:
    for pnum, page in enumerate(pdf.pages, 1):
        text = page.extract_text() or ""
        if not text.strip():
            continue
        for t in page.extract_tables():
            offsets = detect_offsets(t)
            if offsets:
                parse_table(t, pnum, offsets)
        for line in text.split("\n"):
            if re.search(r"Total\s*[A-Za-z\- ]*?:\s*\d+", line) and "électeur" in line.lower():
                m = re.search(r":\s*(\d+)", line)
                m2 = re.search(r"électeurs?[^:]*:\s*([\d\s\u00a0]+)", line, re.IGNORECASE)
                if m and m2:
                    all_totals.append({
                        "page": pnum,
                        "bureaux": int(m.group(1)),
                        "voters": int(re.sub(r"[^\d]", "", m2.group(1))),
                        "raw": line.strip()[:120],
                    })

# Dedup
seen = set()
unique_rows = []
for r in all_rows:
    key = (r["region"], r["dept"], r["bureau"], r["voters"])
    if key not in seen:
        seen.add(key)
        unique_rows.append(r)

print(f"Total rows: {len(unique_rows)} (deduped from {len(all_rows)})")
print(f"Total totals: {len(all_totals)}")

from collections import Counter
by_region = Counter(r["region"] for r in unique_rows)
print(f"\nBy region:")
for reg in sorted(by_region.keys()):
    n = by_region[reg]
    voters = sum(r["voters"] for r in unique_rows if r["region"] == reg)
    print(f"  {reg}: {n} bureaux, {voters:,} voters")

print(f"\n--- per-department ---")
by_dept = Counter((r["region"], r["dept"]) for r in unique_rows)
for key in sorted(by_dept.keys()):
    n = by_dept[key]
    voters = sum(r["voters"] for r in unique_rows if (r["region"], r["dept"]) == key)
    print(f"  {key[0]} / {key[1]}: {n} bureaux, {voters:,} voters")

sum_rows_b = len(unique_rows)
sum_rows_v = sum(r["voters"] for r in unique_rows)
print(f"\nSum of unique rows: {sum_rows_b} bureaux, {sum_rows_v:,} voters")

for t in all_totals:
    print(f"  Page {t['page']} total: {t['bureaux']} BV, {t['voters']:,} voters")

with open("data/geo/elecam-bureaux-de-vote.json", "w", encoding="utf-8") as f:
    json.dump({
        "source": pdf_path,
        "rows": unique_rows,
        "totals": all_totals,
        "regions": dict(by_region),
    }, f, ensure_ascii=False, indent=2)
print(f"\nSaved.")
