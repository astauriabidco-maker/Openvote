# Validation - BUCREP 2023 department population

Source document:

- Slug: `bucrep-projections-demographiques-2023`
- PDF: `data/sources/official/pdfs/bucrep-projections-demographiques-2023.pdf`
- Text extraction: `data/sources/official/extracted/bucrep-projections-demographiques-2023.txt`
- SHA-256: `a2c950b1bd51643ab482591414b7bd7e7ea0600d17a80bea790fa1ea3920d620`
- Source URL: `https://bucrep.org/download/25879/?tmstv=1788889392`
- Download date: 2026-09-09

Extracted data:

- Output CSV: `data/sources/official/structured/bucrep-2023-department-population.csv`
- Rows: 58 departments
- Reference year: 2023
- Confidence: `official_estimate`

Control totals from department rows:

| Region | Department sum | Regional total in table | Difference |
| --- | ---: | ---: | ---: |
| Adamaoua | 1,525,175 | 1,525,175 | 0 |
| Centre | 5,204,170 | 5,204,170 | 0 |
| Est | 1,200,281 | 1,200,281 | 0 |
| Extreme-Nord | 5,573,289 | 5,573,289 | 0 |
| Littoral | 4,247,503 | 4,247,503 | 0 |
| Nord | 3,753,485 | 3,753,485 | 0 |
| Nord-Ouest | 1,774,109 | 1,774,119 | -10 |
| Ouest | 3,315,190 | 3,315,190 | 0 |
| Sud | 938,738 | 938,738 | 0 |
| Sud-Ouest | 1,324,187 | 1,324,187 | 0 |

Known source/OCR issues:

- The department table has `TOTAL NORD-OUEST 1 774 109`, while the regional table has `Nord-Ouest 1 774 119`. The CSV keeps the department total rows as extracted from the department table.
- The Sud-Ouest table spells `TOAL NDIAN`; this was normalized to department `Ndian` with value `85,632`.
- BUCREP spelling `KUPE MANENGOUBA` is mapped to existing department code `SW-KM` / database label `Koupé-Manengouba`.
- BUCREP spelling `NGO-KETUNDJA` is mapped to existing department code `NW-NK` / database label `Ngo-Ketunjia`.

National controls:

- Sum of department rows: 28,856,127
- National total in regional table: 28,856,127
- Difference: 0.
- Sum of the ten regional rows: 28,856,137. This is 10 above the national total and is fully explained by the Nord-Ouest discrepancy above.
