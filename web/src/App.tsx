import { useEffect, useState } from "react";
import LiveScreen from "./LiveScreen";
import MatchListScreen from "./MatchListScreen";

// Hash-based routing so screens survive a reload (including offline, where
// the service worker serves the app shell): "#/" is the match list,
// "#/match/<id>" the live coding screen.
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
  const matchId = /^#\/match\/(.+)$/.exec(route)?.[1];
  return matchId ? (
    <LiveScreen matchId={matchId} />
  ) : (
    <MatchListScreen engineDescription={engineDescription} />
  );
}
