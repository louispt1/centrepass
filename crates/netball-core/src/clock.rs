//! The Quarter Clock (ADR-0006): each quarter's wall-clock span, derived from
//! the log's timestamps - from the quarter's first timestamped Event (normally
//! its first centre pass) to its Quarter Break marker. Intervals fall between
//! spans, so they never count as quarter time.

use serde::{Deserialize, Serialize};

use crate::event::LogEntry;

/// One quarter's span. Either end is null when the log does not know it: no
/// Event yet (or an untimed log) for the start, still in progress (or an
/// untimed break) for the end.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct QuarterSpan {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub start_ms: Option<i64>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub end_ms: Option<i64>,
}

/// Derive each quarter's span, parallel to
/// [`derive_quarter_scores`](crate::derive_quarter_scores): one per segment
/// between QuarterBreak markers, the last one still open. Substitutions never
/// start a quarter - a roster is typically set before the first whistle.
pub fn derive_quarter_spans(log: &[LogEntry]) -> Vec<QuarterSpan> {
    const OPEN: QuarterSpan = QuarterSpan {
        start_ms: None,
        end_ms: None,
    };
    let mut spans = vec![OPEN];
    for entry in log {
        let current = spans.last_mut().unwrap();
        match entry {
            LogEntry::QuarterBreak(quarter_break) => {
                current.end_ms = quarter_break.timestamp_ms;
                spans.push(OPEN);
            }
            LogEntry::Event(event) => {
                current.start_ms = current.start_ms.or(event.timestamp_ms);
            }
            LogEntry::Substitution(_) => {}
        }
    }
    spans
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{
        Action, CourtPosition, Event, GoalPosition, QuarterBreak, Substitution, Team,
    };

    fn goal(at_ms: Option<i64>) -> LogEntry {
        LogEntry::Event(Event {
            team: Team::A,
            action: Action::Goal {
                position: GoalPosition::GS,
                failed: false,
            },
            flagged: false,
            timestamp_ms: at_ms,
        })
    }

    fn quarter_break(at_ms: Option<i64>) -> LogEntry {
        LogEntry::QuarterBreak(QuarterBreak {
            timestamp_ms: at_ms,
        })
    }

    fn span(start_ms: Option<i64>, end_ms: Option<i64>) -> QuarterSpan {
        QuarterSpan { start_ms, end_ms }
    }

    #[test]
    fn an_empty_log_has_one_unstarted_quarter() {
        assert_eq!(derive_quarter_spans(&[]), vec![span(None, None)]);
    }

    #[test]
    fn quarters_run_from_first_event_to_break_excluding_the_interval() {
        let log = [
            LogEntry::Substitution(Substitution {
                team: Team::A,
                position: CourtPosition::GS,
                player: "Alice".to_string(),
                timestamp_ms: Some(0),
            }),
            goal(Some(100)),
            goal(Some(500)),
            quarter_break(Some(900)),
            goal(Some(1_200)),
        ];
        assert_eq!(
            derive_quarter_spans(&log),
            vec![span(Some(100), Some(900)), span(Some(1_200), None)]
        );
    }

    #[test]
    fn a_break_with_no_next_event_yet_leaves_the_next_quarter_unstarted() {
        let log = [goal(Some(0)), quarter_break(Some(900))];
        assert_eq!(
            derive_quarter_spans(&log),
            vec![span(Some(0), Some(900)), span(None, None)]
        );
    }

    #[test]
    fn an_untimed_log_has_no_known_ends() {
        let log = [goal(None), quarter_break(None), goal(None)];
        assert_eq!(
            derive_quarter_spans(&log),
            vec![span(None, None), span(None, None)]
        );
    }
}
