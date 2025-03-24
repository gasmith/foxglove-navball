import { ExtensionContext } from "@foxglove/extension";

import { initNavballPanel } from "./NavballPanel";

export function activate(extensionContext: ExtensionContext): void {
  extensionContext.registerPanel({ name: "Navball", initPanel: initNavballPanel });
}
