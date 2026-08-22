# BOTTLEBOUND

BOTTLEBOUND is a physical fantasy skirmish game. This glossary adds the
canonical language for the referee support application.

## Language

**Referee Console**:
The referee-only application that supports one BOTTLEBOUND Match while the referee retains all physical judgments.
_Avoid_: Referee app, game manager

**Match**:
One BOTTLEBOUND contest from initiative generation until the referee selects End Game.
_Avoid_: Game session, session

**Match State**:
The objective information that describes a Match at one point, including initiative, turns, rounds, characters, abilities, effects, and outcome.
_Avoid_: Game state, session state

**Match Event**:
A recorded occurrence that changes Match State.
_Avoid_: Action, log entry

**Action Draft**:
A temporary selection of an attack or ability, its affected characters, and any Reactions before the referee confirms its results.
_Avoid_: Pending action, unfinished event

**Action Resolution**:
The complete confirmed result of one attack or ability, recorded as one Match Event.
_Avoid_: Action result, combat log entry

**Attack Leg**:
One ordered segment of a physical attack, from its original throw or a Reaction redirection through its later legal bottle contacts.
_Avoid_: Throw segment, hit group

**Team Elimination**:
The permanent Match State condition that starts when all six characters on one team are Downed at the same time.
_Avoid_: Team loss, defeat flag

**Ended Match**:
A Match after the referee confirms End Game. It is read-only until the referee reopens or removes it.
_Avoid_: Finished game, archived Match

**Ruleset**:
One immutable version of the complete authoritative BOTTLEBOUND rules, including universal rules, roster data, ability cards, and quick reference.
_Avoid_: Rules data, rules document version

**Match Summary**:
A compact local record of the latest Ended Match outcome, decision basis, final team state, Ruleset identity, and end time.
_Avoid_: Match history, result log
