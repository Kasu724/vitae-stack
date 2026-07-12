# ATS scoring rubric

## Weights

| Category                         |  Weight |
| -------------------------------- | ------: |
| Parsing compatibility            |      12 |
| Section-heading compatibility    |       6 |
| Contact-information readability  |       5 |
| Date consistency                 |       5 |
| Formatting risk                  |       7 |
| Required qualification coverage  |      15 |
| Preferred qualification coverage |       5 |
| Responsibility alignment         |      10 |
| Evidence strength                |      10 |
| Keyword coverage                 |       5 |
| Keyword stuffing                 |       3 |
| Quantified impact                |       5 |
| Bullet clarity                   |       5 |
| Redundancy                       |       3 |
| Unsupported claims               |       4 |
| **Total**                        | **100** |

Within a category, `score = 100 × earnedApplicablePoints / applicablePoints`, rounded only for display. Overall is the weighted mean of evaluated category scores, renormalized across evaluated weights. The report shows evaluation coverage (`evaluated weight / 100`); coverage below 80% suppresses the overall number and shows category results only.

Display bands describe detected risk, not document quality or hiring odds: 90–100 **few detected risks**, 75–89 **minor detected risks**, 60–74 **material detected risks**, 0–59 **substantial detected risks**. A report with unsupported claims always shows a final-export blocker regardless of numeric band.

Required qualification evidence uses exact reviewed requirement importance and cannot be offset completely by preferred keywords; category caps and blocker badges remain visible. Ruleset changes increment a semantic version and reports are not compared across major versions without recalculation.
