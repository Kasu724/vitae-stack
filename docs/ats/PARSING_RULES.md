# ATS parsing rules

Rules operate on canonical structure and, for exported formats, parse-back results.

| Rule family               | Example deterministic checks                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Parsing (`ATS-PARSE-*`)   | nonempty selectable text; parse-back text coverage ≥98%; reading order; no text rendered solely as image; corruption/encryption; glyph loss     |
| Headings (`ATS-HEAD-*`)   | recognized semantic headings/synonyms; one logical section per heading; no heading embedded in header/footer/image; hierarchy/order consistency |
| Contact (`ATS-CONTACT-*`) | email/phone/link represented as text; no required contact only in header/footer; parseable URI; duplicate/conflicting contact values            |
| Dates (`ATS-DATE-*`)      | consistent format; valid month/year; end ≥ start; current role handling; unexplained overlap is informational, not assumed error                |
| Formatting (`ATS-FMT-*`)  | excessive columns/tables/text boxes; font-size floor; hidden/white text; remote assets; icons without text; dense line length; page overflow    |

Parsing rules never penalize lawful personal choices such as omitting a street address or photo. Contact checks assess readability, not completeness beyond an email or user-selected method. A nontraditional heading can be flagged with the exact recognized alternatives, not declared universally invalid.

Format-specific results name the tested artifact. A canonical document may score differently from a PDF if rendering loses text. Fixtures include accessible single-column, safe two-column, headers/footers, tables, image-only PDF, Unicode, malformed dates, corrupted DOCX, and adversarial hidden-keyword documents.
