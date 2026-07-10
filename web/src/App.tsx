import { useEffect, useState } from "react";
import LiveScreen from "./LiveScreen";
import MatchListScreen from "./MatchListScreen";
import RosterScreen from "./RosterScreen";
import StatsScreen from "./StatsScreen";

// Hash-based routing so screens survive a reload (including offline, where
// the service worker serves the app shell): "#/" is the match list,
// "#/match/<id>" the live coding screen, "#/match/<id>/roster" the roster
// and substitution screen, "#/match/<id>/stats" the post-match stat views.
function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return hash;
}

export default function App({ engineDescription }: { engineDescription: string }) {
  const route = useHashRoute();
  const match = /^#\/match\/([^/]+)(\/roster|\/stats)?$/.exec(route);
  if (!match) return <MatchListScreen engineDescription={engineDescription} />;
  const [, matchId, section] = match;
  if (section === "/roster") return <RosterScreen matchId={matchId} />;
  if (section === "/stats") return <StatsScreen matchId={matchId} />;
  return <LiveScreen matchId={matchId} />;
}
