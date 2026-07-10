//! The Shorthand parser: the power-user import path (`CONTEXT.md`, PRD user
//! stories 34–35). It turns the predecessor's compact text grammar into the
//! same [`LogEntry`] log every other entry path produces, so an imported match
//! flows through the identical derivations — only without timestamps, so
//! Playing Time is unavailable while every order-based statistic stays exact.
//!
//! # Grammar
//!
//! One possession per line. After parenthetical `(comments)` are stripped, a
//! line is either a marker or a run of whitespace-separated event tokens:
//!
//! - **Position** — a single digit `1`–`8` for GS, GA, WA, C, WD, GD, GK, TEAM.
//! - **Action** — `c` receive, `f` feed, `g` goal, `e` unforced turnover,
//!   `p` gain, `pi`/`pd`/`pp` gain by interception/deflection/pick-up,
//!   `i` infringement, `r` rebound. Sub-types match greedily, so `1pi` is a GS
//!   gain by interception, never a gain (`p`) followed by an infringement.
//! - **Modifiers** — a trailing `x` (Failed) and/or `!` (Flagged), in either
//!   order. `x` is only legal on the actions that can fail (receive, feed, goal).
//! - **Team** — a leading `a`/`b` on the line picks the possession's team; with
//!   no prefix the possession belongs to team A (the single-team default).
//! - **Markers** — a line of just `QT` is a quarter break. `S` (substitution)
//!   is reserved but not yet imported.
//!
//! A single malformed token fails the whole parse, pinpointing the line and
//! column so a typo in a long transcription is quick to find; no partial match
//! is ever produced.

use std::fmt;

use crate::event::{
    Action, CentrePassReceivePosition, Event, FeedPosition, GainSubType, GoalPosition, LogEntry,
    Position, QuarterBreak, ReboundPosition, Team,
};
use crate::taxonomy::ActionKind;

/// Why a Shorthand import could not be parsed, pinpointed to a `1`-based line
/// and column so the offending token is easy to find. The [`fmt::Display`]
/// text is written for a coder to read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShorthandError {
    /// `1`-based line number in the input.
    pub line: usize,
    /// `1`-based character column within that line, pointing at the problem.
    pub column: usize,
    /// The token (or fragment) the error is about, for display and testing.
    pub token: String,
    /// The machine-readable reason, carrying the specifics of the failure.
    pub kind: ShorthandErrorKind,
}

/// The specific reason a [`ShorthandError`] was raised. Split out from the
/// location so tests can assert the cause without pinning message wording.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShorthandErrorKind {
    /// A token did not begin with a position digit.
    MissingPosition,
    /// A digit outside the `1`–`8` position range (e.g. `0` or `9`).
    InvalidPosition { digit: char },
    /// A position with no action letter following it.
    MissingAction,
    /// An action letter the grammar does not define.
    UnknownAction { found: char },
    /// A position this action may never be coded for (e.g. a shot by WD).
    IllegalPosition { position: Position, action: ActionKind },
    /// A Failed (`x`) modifier on an action that cannot fail.
    FailedNotApplicable { action: ActionKind },
    /// The same modifier (`x` or `!`) given twice on one event.
    DuplicateModifier { modifier: char },
    /// Leftover characters after a fully-formed event.
    UnexpectedTrailing { found: char },
    /// A `QT` quarter-break marker sharing its line with other tokens.
    QuarterBreakNotAlone,
    /// A team prefix (`a`/`b`) with no events after it.
    EmptyPossession { prefix: char },
    /// A substitution (`S`) marker — reserved, but not imported yet.
    SubstitutionNotSupported,
    /// A `(` comment that is never closed.
    UnclosedComment,
    /// A `)` with no matching `(`.
    UnmatchedCommentClose,
}

impl fmt::Display for ShorthandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Line {}, column {}: {}", self.line, self.column, self.kind)
    }
}

impl fmt::Display for ShorthandErrorKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        const ACTIONS: &str = "c f g e p pi pd pp i r";
        match self {
            ShorthandErrorKind::MissingPosition => {
                write!(f, "expected a position digit 1–8 to start the event")
            }
            ShorthandErrorKind::InvalidPosition { digit } => {
                write!(f, "'{digit}' is not a position; use 1–8 (GS, GA, WA, C, WD, GD, GK, TEAM)")
            }
            ShorthandErrorKind::MissingAction => {
                write!(f, "this position needs an action ({ACTIONS})")
            }
            ShorthandErrorKind::UnknownAction { found } => {
                write!(f, "'{found}' is not an action; expected one of {ACTIONS}")
            }
            ShorthandErrorKind::IllegalPosition { position, action } => write!(
                f,
                "{} cannot be coded for {}",
                action_name(*action),
                position_code(*position)
            ),
            ShorthandErrorKind::FailedNotApplicable { action } => {
                write!(f, "{} cannot be marked failed (x)", action_name(*action))
            }
            ShorthandErrorKind::DuplicateModifier { modifier } => {
                write!(f, "modifier '{modifier}' is repeated")
            }
            ShorthandErrorKind::UnexpectedTrailing { found } => {
                write!(f, "unexpected '{found}' after the event")
            }
            ShorthandErrorKind::QuarterBreakNotAlone => {
                write!(f, "a quarter break (QT) must be on its own line")
            }
            ShorthandErrorKind::EmptyPossession { prefix } => {
                write!(f, "team prefix '{prefix}' must be followed by at least one event")
            }
            ShorthandErrorKind::SubstitutionNotSupported => {
                write!(f, "substitution markers (S) are not supported by Shorthand import yet")
            }
            ShorthandErrorKind::UnclosedComment => {
                write!(f, "this '(' comment is never closed")
            }
            ShorthandErrorKind::UnmatchedCommentClose => {
                write!(f, "this ')' has no matching '('")
            }
        }
    }
}

impl std::error::Error for ShorthandError {}

/// Parse Shorthand text into a log of [`LogEntry`]s, in reading order. On any
/// malformed token the whole parse fails with a located [`ShorthandError`] and
/// no entries are returned, so a caller can never import a partial match.
///
/// The returned entries carry no timestamps (`timestamp_ms: None`): a
/// transcription has no clock. Callers wrap the log with team names and a date
/// to form a Match File.
pub fn parse_shorthand(input: &str) -> Result<Vec<LogEntry>, ShorthandError> {
    let mut log = Vec::new();
    for (index, raw_line) in input.split('\n').enumerate() {
        let line_number = index + 1;
        // Normalise a trailing '\r' from Windows line endings so it never
        // counts toward a column or trips tokenisation.
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        parse_line(line, line_number, &mut log)?;
    }
    Ok(log)
}

/// Parse one line, appending its entries (zero for a blank line, one for a
/// marker, one per event token for a possession) to `log`.
fn parse_line(line: &str, line_number: usize, log: &mut Vec<LogEntry>) -> Result<(), ShorthandError> {
    let masked = strip_comments(line, line_number)?;
    let tokens = tokenize(&masked);
    let Some(&(first_column, ref first)) = tokens.first() else {
        // Blank, or a line that was pure comment: nothing to code.
        return Ok(());
    };

    let first_text: String = first.iter().collect();

    // Markers are whole-line and never carry a team prefix.
    if first_text == "QT" {
        if let Some(&(column, ref extra)) = tokens.get(1) {
            return Err(ShorthandError {
                line: line_number,
                column,
                token: extra.iter().collect(),
                kind: ShorthandErrorKind::QuarterBreakNotAlone,
            });
        }
        log.push(LogEntry::QuarterBreak(QuarterBreak { timestamp_ms: None }));
        return Ok(());
    }
    if first[0] == 'S' {
        return Err(ShorthandError {
            line: line_number,
            column: first_column,
            token: first_text,
            kind: ShorthandErrorKind::SubstitutionNotSupported,
        });
    }

    // Otherwise a possession: an optional leading a/b picks the team, then one
    // event per token.
    let mut token_slices: Vec<(usize, &[char])> = tokens.iter().map(|(c, t)| (*c, t.as_slice())).collect();
    let mut team = Team::A;
    let (first_col, first_chars) = token_slices[0];
    if matches!(first_chars[0], 'a' | 'b') {
        team = if first_chars[0] == 'a' { Team::A } else { Team::B };
        if first_chars.len() == 1 {
            // Detached prefix: `a 1c 2f`. Drop the prefix token.
            token_slices.remove(0);
            if token_slices.is_empty() {
                return Err(ShorthandError {
                    line: line_number,
                    column: first_col,
                    token: first_chars.iter().collect(),
                    kind: ShorthandErrorKind::EmptyPossession { prefix: first_chars[0] },
                });
            }
        } else {
            // Attached prefix: `a1c`. Keep the remainder as the first event,
            // shifting its column past the consumed prefix character.
            token_slices[0] = (first_col + 1, &first_chars[1..]);
        }
    }

    for (column, token) in token_slices {
        let (action, flagged) = parse_event_token(token).map_err(|(offset, kind)| ShorthandError {
            line: line_number,
            column: column + offset,
            token: token.iter().collect(),
            kind,
        })?;
        log.push(LogEntry::Event(Event {
            team,
            action,
            flagged,
            timestamp_ms: None,
        }));
    }
    Ok(())
}

/// Parse a single event token (no surrounding whitespace) into its [`Action`]
/// and whether it was Flagged (`!` lives on the [`Event`], not the action). On
/// failure returns the `0`-based character offset within the token and the
/// reason, which the caller turns into an absolute column.
fn parse_event_token(token: &[char]) -> Result<(Action, bool), (usize, ShorthandErrorKind)> {
    // Position: exactly one digit, 1–8.
    let position = match token[0] {
        c @ '1'..='8' => POSITIONS[(c as usize) - ('1' as usize)],
        c if c.is_ascii_digit() => return Err((0, ShorthandErrorKind::InvalidPosition { digit: c })),
        _ => return Err((0, ShorthandErrorKind::MissingPosition)),
    };

    // Action, matched greedily so `pi`/`pd`/`pp` win over a bare `p`.
    let mut index = 1;
    if index >= token.len() {
        return Err((index, ShorthandErrorKind::MissingAction));
    }
    let (kind, sub_type) = match token[index] {
        'c' => (ActionKind::CentrePassReceive, None),
        'f' => (ActionKind::Feed, None),
        'g' => (ActionKind::Goal, None),
        'e' => (ActionKind::UnforcedTurnover, None),
        'i' => (ActionKind::Infringement, None),
        'r' => (ActionKind::Rebound, None),
        'p' => {
            let sub = match token.get(index + 1) {
                Some('i') => Some(GainSubType::Interception),
                Some('d') => Some(GainSubType::Deflection),
                Some('p') => Some(GainSubType::PickUp),
                _ => None,
            };
            if sub.is_some() {
                index += 1;
            }
            (ActionKind::Gain, sub)
        }
        found => return Err((index, ShorthandErrorKind::UnknownAction { found })),
    };
    index += 1;

    // Modifiers: any order, each at most once. `x` only where the action can
    // fail; `!` on any action.
    let mut failed = false;
    let mut flagged = false;
    while index < token.len() {
        match token[index] {
            'x' => {
                if !kind.can_fail() {
                    return Err((index, ShorthandErrorKind::FailedNotApplicable { action: kind }));
                }
                if failed {
                    return Err((index, ShorthandErrorKind::DuplicateModifier { modifier: 'x' }));
                }
                failed = true;
            }
            '!' => {
                if flagged {
                    return Err((index, ShorthandErrorKind::DuplicateModifier { modifier: '!' }));
                }
                flagged = true;
            }
            found => return Err((index, ShorthandErrorKind::UnexpectedTrailing { found })),
        }
        index += 1;
    }

    let action = build_action(kind, sub_type, position, failed)
        .ok_or((0, ShorthandErrorKind::IllegalPosition { position, action: kind }))?;
    Ok((action, flagged))
}

/// Assemble an [`Action`] from its parts, or `None` if the position is illegal
/// for the action — the same legality the type system enforces, surfaced as a
/// parse error rather than an unrepresentable value.
fn build_action(
    kind: ActionKind,
    sub_type: Option<GainSubType>,
    position: Position,
    failed: bool,
) -> Option<Action> {
    Some(match kind {
        ActionKind::CentrePassReceive => Action::CentrePassReceive {
            position: CentrePassReceivePosition::from_position(position)?,
            failed,
        },
        ActionKind::Feed => Action::Feed {
            position: FeedPosition::from_position(position)?,
            failed,
        },
        ActionKind::Goal => Action::Goal {
            position: GoalPosition::from_position(position)?,
            failed,
        },
        ActionKind::Gain => Action::Gain { position, sub_type },
        ActionKind::UnforcedTurnover => Action::UnforcedTurnover { position },
        ActionKind::Infringement => Action::Infringement { position },
        ActionKind::Rebound => Action::Rebound {
            position: ReboundPosition::from_position(position)?,
        },
    })
}

/// Position digits `1`–`8` in order.
const POSITIONS: [Position; 8] = [
    Position::GS,
    Position::GA,
    Position::WA,
    Position::C,
    Position::WD,
    Position::GD,
    Position::GK,
    Position::Team,
];

/// Blank out `(comment)` spans with spaces, preserving every other character's
/// column so error positions still refer to the original line. Errors on an
/// unbalanced parenthesis, located at the offending character.
fn strip_comments(line: &str, line_number: usize) -> Result<Vec<char>, ShorthandError> {
    let mut masked = Vec::with_capacity(line.chars().count());
    let mut depth: usize = 0;
    let mut open_column = 0;
    for (index, ch) in line.chars().enumerate() {
        match ch {
            '(' => {
                if depth == 0 {
                    open_column = index + 1;
                }
                depth += 1;
                masked.push(' ');
            }
            ')' => {
                if depth == 0 {
                    return Err(ShorthandError {
                        line: line_number,
                        column: index + 1,
                        token: ")".to_string(),
                        kind: ShorthandErrorKind::UnmatchedCommentClose,
                    });
                }
                depth -= 1;
                masked.push(' ');
            }
            _ => masked.push(if depth > 0 { ' ' } else { ch }),
        }
    }
    if depth > 0 {
        return Err(ShorthandError {
            line: line_number,
            column: open_column,
            token: "(".to_string(),
            kind: ShorthandErrorKind::UnclosedComment,
        });
    }
    Ok(masked)
}

/// Split a masked line into whitespace-separated tokens, each tagged with its
/// `1`-based starting column in the original line.
fn tokenize(masked: &[char]) -> Vec<(usize, Vec<char>)> {
    let mut tokens = Vec::new();
    let mut current: Vec<char> = Vec::new();
    let mut start = 0;
    for (index, &ch) in masked.iter().enumerate() {
        if ch.is_whitespace() {
            if !current.is_empty() {
                tokens.push((start + 1, std::mem::take(&mut current)));
            }
        } else {
            if current.is_empty() {
                start = index;
            }
            current.push(ch);
        }
    }
    if !current.is_empty() {
        tokens.push((start + 1, current));
    }
    tokens
}

/// The two-letter position code (`GS`…`GK`, `TEAM`) for an error message.
fn position_code(position: Position) -> &'static str {
    match position {
        Position::GS => "GS",
        Position::GA => "GA",
        Position::WA => "WA",
        Position::C => "C",
        Position::WD => "WD",
        Position::GD => "GD",
        Position::GK => "GK",
        Position::Team => "TEAM",
    }
}

/// The readable action name for an error message.
fn action_name(kind: ActionKind) -> &'static str {
    match kind {
        ActionKind::CentrePassReceive => "a centre pass receive",
        ActionKind::Feed => "a feed",
        ActionKind::Goal => "a goal",
        ActionKind::Gain => "a gain",
        ActionKind::UnforcedTurnover => "an unforced turnover",
        ActionKind::Infringement => "an infringement",
        ActionKind::Rebound => "a rebound",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Pull the events out of a log, asserting there are no markers.
    fn events(log: &[LogEntry]) -> Vec<&Event> {
        log.iter()
            .map(|entry| match entry {
                LogEntry::Event(event) => event,
                other => panic!("expected only events, got {other:?}"),
            })
            .collect()
    }

    fn only_event(input: &str) -> Event {
        let log = parse_shorthand(input).expect("should parse");
        assert_eq!(log.len(), 1, "expected exactly one entry from {input:?}");
        match &log[0] {
            LogEntry::Event(event) => event.clone(),
            other => panic!("expected an event, got {other:?}"),
        }
    }

    // --- Every token type ----------------------------------------------------

    #[test]
    fn each_position_digit_maps_to_its_position() {
        // Unforced turnover is legal for every position, so it isolates the
        // digit→position mapping cleanly across all eight.
        for (digit, position) in ('1'..='8').zip(POSITIONS) {
            let event = only_event(&format!("{digit}e"));
            assert_eq!(event.action.position(), position, "digit {digit}");
        }
    }

    #[test]
    fn each_action_letter_maps_to_its_action() {
        assert_eq!(
            only_event("2c").action,
            Action::CentrePassReceive {
                position: CentrePassReceivePosition::GA,
                failed: false
            }
        );
        assert_eq!(
            only_event("1f").action,
            Action::Feed {
                position: FeedPosition::GS,
                failed: false
            }
        );
        assert_eq!(
            only_event("1g").action,
            Action::Goal {
                position: GoalPosition::GS,
                failed: false
            }
        );
        assert_eq!(
            only_event("4e").action,
            Action::UnforcedTurnover {
                position: Position::C
            }
        );
        assert_eq!(
            only_event("4p").action,
            Action::Gain {
                position: Position::C,
                sub_type: None
            }
        );
        assert_eq!(
            only_event("4i").action,
            Action::Infringement {
                position: Position::C
            }
        );
        assert_eq!(
            only_event("1r").action,
            Action::Rebound {
                position: ReboundPosition::GS
            }
        );
    }

    #[test]
    fn gain_sub_types_parse_and_match_greedily() {
        // The headline example: `1pi` is a GS gain by interception, never a
        // gain (p) followed by an infringement (i).
        assert_eq!(
            only_event("1pi").action,
            Action::Gain {
                position: Position::GS,
                sub_type: Some(GainSubType::Interception)
            }
        );
        assert_eq!(
            only_event("6pd").action,
            Action::Gain {
                position: Position::GD,
                sub_type: Some(GainSubType::Deflection)
            }
        );
        assert_eq!(
            only_event("6pp").action,
            Action::Gain {
                position: Position::GD,
                sub_type: Some(GainSubType::PickUp)
            }
        );
    }

    #[test]
    fn team_position_takes_gains_turnovers_infringements_and_opposition_goals() {
        assert_eq!(
            only_event("8g").action,
            Action::Goal {
                position: GoalPosition::Team,
                failed: false
            }
        );
        assert_eq!(
            only_event("8p").action,
            Action::Gain {
                position: Position::Team,
                sub_type: None
            }
        );
    }

    // --- Modifiers and stacking ---------------------------------------------

    #[test]
    fn failed_modifier_marks_the_action() {
        assert_eq!(
            only_event("1gx").action,
            Action::Goal {
                position: GoalPosition::GS,
                failed: true
            }
        );
        assert_eq!(
            only_event("2cx").action,
            Action::CentrePassReceive {
                position: CentrePassReceivePosition::GA,
                failed: true
            }
        );
    }

    #[test]
    fn flagged_modifier_sets_the_event_flag_not_the_action() {
        let event = only_event("1g!");
        assert!(event.flagged);
        assert_eq!(
            event.action,
            Action::Goal {
                position: GoalPosition::GS,
                failed: false
            }
        );
    }

    #[test]
    fn modifiers_stack_in_either_order() {
        for input in ["1gx!", "1g!x"] {
            let event = only_event(input);
            assert!(event.flagged, "{input}");
            assert_eq!(
                event.action,
                Action::Goal {
                    position: GoalPosition::GS,
                    failed: true
                },
                "{input}"
            );
        }
    }

    #[test]
    fn a_failed_gain_sub_type_can_still_flag() {
        let event = only_event("1pi!");
        assert!(event.flagged);
        assert_eq!(
            event.action,
            Action::Gain {
                position: Position::GS,
                sub_type: Some(GainSubType::Interception)
            }
        );
    }

    // --- Comments ------------------------------------------------------------

    #[test]
    fn comments_are_stripped_before_parsing() {
        let log = parse_shorthand("2c (great hands) 2f 1g (top corner)").unwrap();
        let events = events(&log);
        assert_eq!(events.len(), 3);
        assert_eq!(events[0].action.position(), Position::GA);
        assert_eq!(events[2].action.kind(), ActionKind::Goal);
    }

    #[test]
    fn a_line_that_is_only_a_comment_contributes_nothing() {
        let log = parse_shorthand("(warm-up, ignore)\n1g").unwrap();
        assert_eq!(events(&log).len(), 1);
    }

    #[test]
    fn a_comment_can_split_a_token_boundary_without_merging_tokens() {
        // The blanked comment still separates the two tokens.
        let log = parse_shorthand("1g(nice)2f").unwrap();
        let events = events(&log);
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].action.kind(), ActionKind::Goal);
        assert_eq!(events[1].action.kind(), ActionKind::Feed);
    }

    // --- Markers -------------------------------------------------------------

    #[test]
    fn qt_becomes_a_quarter_break() {
        let log = parse_shorthand("1g\nQT\n1g").unwrap();
        assert_eq!(log.len(), 3);
        assert!(matches!(log[1], LogEntry::QuarterBreak(_)));
        assert_eq!(log[1].timestamp_ms(), None);
    }

    // --- Team modes ----------------------------------------------------------

    #[test]
    fn no_prefix_is_the_single_team_default_of_team_a() {
        for event in events(&parse_shorthand("1g\n2f").unwrap()) {
            assert_eq!(event.team, Team::A);
        }
    }

    #[test]
    fn attached_prefix_sets_the_team_for_the_whole_line() {
        let log = parse_shorthand("a2c 2f\nb8g").unwrap();
        let events = events(&log);
        assert_eq!(events[0].team, Team::A);
        assert_eq!(events[1].team, Team::A);
        assert_eq!(events[2].team, Team::B);
        assert_eq!(events[2].action.position(), Position::Team);
    }

    #[test]
    fn detached_prefix_sets_the_team_for_the_whole_line() {
        let log = parse_shorthand("b 1g 2f").unwrap();
        for event in events(&log) {
            assert_eq!(event.team, Team::B);
        }
        assert_eq!(events(&log).len(), 2);
    }

    #[test]
    fn timestamps_are_always_absent_on_import() {
        let log = parse_shorthand("a2c 2f 1g\nQT\nb8g").unwrap();
        for entry in &log {
            assert_eq!(entry.timestamp_ms(), None);
        }
    }

    #[test]
    fn blank_lines_are_ignored() {
        let log = parse_shorthand("1g\n\n   \n2f\n").unwrap();
        assert_eq!(events(&log).len(), 2);
    }

    // --- Malformed inputs: each asserts the pinpointed position --------------

    fn error(input: &str) -> ShorthandError {
        parse_shorthand(input).expect_err("should fail to parse")
    }

    #[test]
    fn an_unknown_action_points_at_the_letter() {
        let err = error("1z");
        assert_eq!((err.line, err.column), (1, 2));
        assert_eq!(err.kind, ShorthandErrorKind::UnknownAction { found: 'z' });
    }

    #[test]
    fn a_token_without_a_position_points_at_its_start() {
        let err = error("g1");
        assert_eq!((err.line, err.column), (1, 1));
        assert_eq!(err.kind, ShorthandErrorKind::MissingPosition);
    }

    #[test]
    fn a_position_digit_out_of_range_is_reported() {
        let err = error("9g");
        assert_eq!((err.line, err.column), (1, 1));
        assert_eq!(err.kind, ShorthandErrorKind::InvalidPosition { digit: '9' });
        assert_eq!(error("0g").kind, ShorthandErrorKind::InvalidPosition { digit: '0' });
    }

    #[test]
    fn a_position_with_no_action_points_past_the_digit() {
        let err = error("1");
        assert_eq!((err.line, err.column), (1, 2));
        assert_eq!(err.kind, ShorthandErrorKind::MissingAction);
    }

    #[test]
    fn an_illegal_position_for_the_action_points_at_the_position() {
        // A shot by WD (5) can never exist in the model.
        let err = error("5g");
        assert_eq!((err.line, err.column), (1, 1));
        assert_eq!(
            err.kind,
            ShorthandErrorKind::IllegalPosition {
                position: Position::WD,
                action: ActionKind::Goal
            }
        );
    }

    #[test]
    fn a_receive_by_a_non_receiver_is_rejected() {
        // Centre (4) may not take a centre pass receive.
        assert_eq!(
            error("4c").kind,
            ShorthandErrorKind::IllegalPosition {
                position: Position::C,
                action: ActionKind::CentrePassReceive
            }
        );
    }

    #[test]
    fn failed_on_an_action_that_cannot_fail_is_rejected_at_the_x() {
        // A rebound is by definition a successful regather.
        let err = error("1rx");
        assert_eq!((err.line, err.column), (1, 3));
        assert_eq!(
            err.kind,
            ShorthandErrorKind::FailedNotApplicable {
                action: ActionKind::Rebound
            }
        );
        assert_eq!(
            error("4px").kind,
            ShorthandErrorKind::FailedNotApplicable {
                action: ActionKind::Gain
            }
        );
    }

    #[test]
    fn a_repeated_modifier_is_rejected_at_the_second_one() {
        let err = error("1gxx");
        assert_eq!((err.line, err.column), (1, 4));
        assert_eq!(err.kind, ShorthandErrorKind::DuplicateModifier { modifier: 'x' });
        assert_eq!(error("1g!!").kind, ShorthandErrorKind::DuplicateModifier { modifier: '!' });
    }

    #[test]
    fn trailing_junk_after_an_event_points_at_it() {
        let err = error("1gz");
        assert_eq!((err.line, err.column), (1, 3));
        assert_eq!(err.kind, ShorthandErrorKind::UnexpectedTrailing { found: 'z' });
    }

    #[test]
    fn qt_with_extra_tokens_points_at_the_extra() {
        let err = error("QT 1g");
        assert_eq!((err.line, err.column), (1, 4));
        assert_eq!(err.kind, ShorthandErrorKind::QuarterBreakNotAlone);
    }

    #[test]
    fn a_lone_team_prefix_is_an_empty_possession() {
        let err = error("a");
        assert_eq!((err.line, err.column), (1, 1));
        assert_eq!(err.kind, ShorthandErrorKind::EmptyPossession { prefix: 'a' });
    }

    #[test]
    fn a_substitution_marker_is_reported_as_unsupported() {
        let err = error("1g\nS");
        assert_eq!(err.line, 2);
        assert_eq!(err.kind, ShorthandErrorKind::SubstitutionNotSupported);
    }

    #[test]
    fn an_unclosed_comment_points_at_the_open_paren() {
        let err = error("1g (oops");
        assert_eq!((err.line, err.column), (1, 4));
        assert_eq!(err.kind, ShorthandErrorKind::UnclosedComment);
    }

    #[test]
    fn an_unmatched_close_paren_points_at_it() {
        let err = error("1g )");
        assert_eq!((err.line, err.column), (1, 4));
        assert_eq!(err.kind, ShorthandErrorKind::UnmatchedCommentClose);
    }

    #[test]
    fn the_error_line_is_the_line_the_token_is_on() {
        let err = error("1g\n2f\n5g\n1c");
        assert_eq!(err.line, 3);
        assert_eq!(err.column, 1);
        assert_eq!(err.kind, ShorthandErrorKind::IllegalPosition {
            position: Position::WD,
            action: ActionKind::Goal,
        });
    }

    #[test]
    fn the_column_accounts_for_a_stripped_comment_earlier_on_the_line() {
        // The comment is blanked in place, so the bad token keeps its column.
        let err = error("1g (nice pass) 5g");
        assert_eq!((err.line, err.column), (1, 16));
        assert_eq!(err.kind, ShorthandErrorKind::IllegalPosition {
            position: Position::WD,
            action: ActionKind::Goal,
        });
    }

    #[test]
    fn a_bad_token_after_an_attached_prefix_keeps_its_column() {
        // `a` is consumed; the fault is the `9` at column 2.
        let err = error("a9g");
        assert_eq!((err.line, err.column), (1, 2));
        assert_eq!(err.kind, ShorthandErrorKind::InvalidPosition { digit: '9' });
    }

    #[test]
    fn no_partial_log_is_returned_on_failure() {
        // Good events precede the bad one, but the whole parse fails.
        assert!(parse_shorthand("1g\n2f\n5g").is_err());
    }

    #[test]
    fn the_display_message_names_the_line_and_column() {
        let message = error("1g\n5g").to_string();
        assert!(message.contains("Line 2"));
        assert!(message.contains("column 1"));
        assert!(message.to_lowercase().contains("gs") || message.contains("WD"));
    }

    // --- A whole realistic transcription --------------------------------------

    #[test]
    fn a_two_team_transcription_parses_end_to_end() {
        let input = "\
a2c 2f 1g (opening goal)
b 3c 8g
QT
a2c 1gx 1r 1g
b8g";
        let log = parse_shorthand(input).unwrap();
        // 3 + 2 + break + 4 + 1 = 11 entries.
        assert_eq!(log.len(), 11);
        assert!(matches!(log[5], LogEntry::QuarterBreak(_)));
        // The missed shot then rebound then goal in team A's second possession.
        assert_eq!(
            events(&[log[7].clone()])[0].action,
            Action::Goal { position: GoalPosition::GS, failed: true }
        );
    }
}
