"use client";

import { useEffect } from "react";
import { hungMessage } from "@/lib/onboarding";

/**
 * The one-line "Hung 3 pieces on your rail." note shown at the top of the rail right after someone
 * adds photos while they are still getting set up (PROJECT.md §5, onboarding step 3). It arrives as
 * `?hung=3` on the address. Once shown, the parameter is dropped from the address (without leaving
 * the page) so that reloading or sharing the link doesn't show the note again.
 */
export function HungNote({ count }: { count: number }) {
  useEffect(() => {
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);

  return (
    <div className="onb-hung" role="status">
      {hungMessage(count)}
    </div>
  );
}
