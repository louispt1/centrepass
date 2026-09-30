//! Fixture import: a season's schedule as CSV (`date,team,opposition`), read
//! into Fixtures - Matches with an empty log (`CONTEXT.md`, ADR-0007).
//!
//! Columns are found by header name, case-insensitively, in any order; other
//! columns (venue, time, round) are ignored. Dates are `YYYY-MM-DD` or
//! day-first `DD/MM/YYYY`. One bad row rejects the whole file, so an import is
//! never partial.

use std::fmt;

use crate::match_file::MatchFile;

/// Why a fixture CSV could not be imported, written for a coder to read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FixturesCsvError {
    /// The header row lacks a required column.
    MissingColumn(&'static str),
    /// A data row is unusable. `row` is the line it starts on (the header is
    /// row 1), which is the spreadsheet row unless a field holds a line break.
    BadRow { row: usize, problem: String },
    /// A header and nothing else.
    NoFixtures,
}

impl fmt::Display for FixturesCsvError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FixturesCsvError::MissingColumn(column) => write!(
                f,
                "The first row needs a \"{column}\" column (columns: date, team, opposition)."
            ),
            FixturesCsvError::BadRow { row, problem } => write!(f, "Row {row}: {problem}"),
            FixturesCsvError::NoFixtures => write!(f, "This file has no fixtures in it."),
        }
    }
}

impl std::error::Error for FixturesCsvError {}

/// Split CSV text into rows of fields: quoted fields may hold commas, `""`
/// and line breaks; a leading byte-order mark (Excel) is dropped. Each row
/// carries its 1-based line number, and blank lines are skipped.
fn records(text: &str) -> Vec<(usize, Vec<String>)> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut rows = Vec::new();
    let (mut row, mut field) = (Vec::new(), String::new());
    let (mut line, mut row_line, mut quoted) = (1, 1, false);
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' if quoted && chars.peek() == Some(&'"') => {
                chars.next();
                field.push('"');
            }
            '"' => quoted = !quoted,
            ',' if !quoted => row.push(std::mem::take(&mut field)),
            '\r' if !quoted => {}
            '\n' if !quoted => {
                row.push(std::mem::take(&mut field));
                rows.push((row_line, std::mem::take(&mut row)));
                line += 1;
                row_line = line;
            }
            c => {
                if c == '\n' {
                    line += 1;
                }
                field.push(c);
            }
        }
    }
    row.push(field);
    rows.push((row_line, row));
    rows.retain(|(_, fields)| fields.iter().any(|field| !field.trim().is_empty()));
    rows
}

/// `YYYY-MM-DD` or day-first `D/M/YYYY`, as `YYYY-MM-DD`.
fn parse_date(raw: &str) -> Option<String> {
    let parts: Vec<&str> = if raw.contains('-') {
        raw.split('-').collect()
    } else {
        raw.split('/').rev().collect()
    };
    let [year, month, day] = parts[..] else {
        return None;
    };
    let number = |part: &str, digits: std::ops::RangeInclusive<usize>| {
        let all_digits = !part.is_empty() && part.chars().all(|c| c.is_ascii_digit());
        (all_digits && digits.contains(&part.len())).then(|| part.parse::<u32>().ok())?
    };
    let (year, month, day) = (
        number(year, 4..=4)?,
        number(month, 1..=2)?,
        number(day, 1..=2)?,
    );
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month {
        2 if leap => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        1..=12 => 31,
        _ => return None,
    };
    (1..=days)
        .contains(&day)
        .then(|| format!("{year:04}-{month:02}-{day:02}"))
}

/// Read a fixture CSV into Fixtures: Match Files with no id (the caller
/// assigns one) and an empty log. `team` is Team A, `opposition` Team B.
pub fn parse_fixtures_csv(text: &str) -> Result<Vec<MatchFile>, FixturesCsvError> {
    let mut rows = records(text).into_iter();
    let header: Vec<String> = rows
        .next()
        .map(|(_, fields)| fields.iter().map(|f| f.trim().to_lowercase()).collect())
        .unwrap_or_default();
    let column = |name: &'static str| {
        header
            .iter()
            .position(|h| h == name)
            .ok_or(FixturesCsvError::MissingColumn(name))
    };
    let (date, team, opposition) = (column("date")?, column("team")?, column("opposition")?);

    let fixtures = rows
        .map(|(row, fields)| {
            let field = |index: usize| fields.get(index).map_or("", |f| f.trim());
            let bad = |problem: String| FixturesCsvError::BadRow { row, problem };
            let parsed = parse_date(field(date)).ok_or_else(|| {
                bad(format!(
                    "\"{}\" isn't a date. Use DD/MM/YYYY or YYYY-MM-DD.",
                    field(date)
                ))
            })?;
            for (index, name) in [(team, "team"), (opposition, "opposition")] {
                if field(index).is_empty() {
                    return Err(bad(format!("the {name} is blank.")));
                }
            }
            Ok(MatchFile {
                id: None,
                team_a_name: field(team).to_string(),
                team_b_name: field(opposition).to_string(),
                date: parsed,
                log: Vec::new(),
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    if fixtures.is_empty() {
        return Err(FixturesCsvError::NoFixtures);
    }
    Ok(fixtures)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(fixtures: &[MatchFile]) -> Vec<(&str, &str, &str)> {
        fixtures
            .iter()
            .map(|f| {
                (
                    f.date.as_str(),
                    f.team_a_name.as_str(),
                    f.team_b_name.as_str(),
                )
            })
            .collect()
    }

    #[test]
    fn reads_columns_by_name_in_any_order_ignoring_extras() {
        let csv = "\u{feff}Venue,Opposition,DATE,Team\r\n\
                   Court 1,Riverside,14/09/2026,Seniors A\r\n\
                   \r\n\
                   \"Hall, North\",\"The \"\"Hornets\"\"\",2026-09-21, U14 \r\n";
        let fixtures = parse_fixtures_csv(csv).unwrap();
        assert_eq!(
            names(&fixtures),
            [
                ("2026-09-14", "Seniors A", "Riverside"),
                ("2026-09-21", "U14", "The \"Hornets\""),
            ]
        );
        assert!(fixtures.iter().all(|f| f.id.is_none() && f.log.is_empty()));
    }

    #[test]
    fn dates_are_day_first_or_iso_and_must_exist() {
        assert_eq!(parse_date("4/9/2026").as_deref(), Some("2026-09-04"));
        assert_eq!(parse_date("29/02/2028").as_deref(), Some("2028-02-29"));
        // Month-first is rejected, never guessed.
        assert_eq!(parse_date("09/14/2026"), None);
        assert_eq!(parse_date("29/02/2026"), None);
        assert_eq!(parse_date("2026-9-31"), None);
        assert_eq!(parse_date("14/09/26"), None);
        assert_eq!(parse_date("next week"), None);
    }

    #[test]
    fn one_bad_row_rejects_the_file_naming_the_row() {
        let csv = "date,team,opposition\n14/09/2026,A,B\n09/14/2026,A,B\n";
        let error = parse_fixtures_csv(csv).unwrap_err();
        assert_eq!(
            error,
            FixturesCsvError::BadRow {
                row: 3,
                problem: "\"09/14/2026\" isn't a date. Use DD/MM/YYYY or YYYY-MM-DD.".into()
            }
        );
        let blank = parse_fixtures_csv("date,team,opposition\n14/09/2026,A,\n").unwrap_err();
        assert_eq!(blank.to_string(), "Row 2: the opposition is blank.");
    }

    #[test]
    fn a_quoted_line_break_keeps_row_numbers_true() {
        let csv = "date,team,opposition\n14/09/2026,\"Seniors\nA\",B\nbad,A,B\n";
        let error = parse_fixtures_csv(csv).unwrap_err();
        assert!(error.to_string().starts_with("Row 4:"), "{error}");
    }

    #[test]
    fn missing_columns_and_empty_files_are_explained() {
        assert_eq!(
            parse_fixtures_csv("date,team\n14/09/2026,A\n").unwrap_err(),
            FixturesCsvError::MissingColumn("opposition")
        );
        assert_eq!(
            parse_fixtures_csv("date,team,opposition\n").unwrap_err(),
            FixturesCsvError::NoFixtures
        );
        assert_eq!(
            parse_fixtures_csv("").unwrap_err(),
            FixturesCsvError::MissingColumn("date")
        );
    }
}
