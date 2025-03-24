import { ExtensionContext } from "@foxglove/extension";

import { initNavballPanel } from "./NavballPanel";

export function activate(extensionContext: ExtensionContext): void {
  extensionContext.registerPanel({ name: "navball-panel", initPanel: initNavballPanel });
}
