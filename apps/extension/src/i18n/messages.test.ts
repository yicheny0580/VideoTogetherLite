import { describe, expect, it } from "vitest";

import { getMessages, popupMessages, translate } from "./messages";

describe("extension messages", () => {
  it("loads panel copy by language", () => {
    expect(translate("en-us", "create_room_button")).toBe("Create room");
    expect(translate("zh-cn", "create_room_button")).toBe("创建房间");
  });

  it("falls back for unsupported languages", () => {
    expect(getMessages("fr-FR").join_room_button).toBe("Join room");
  });

  it("keeps popup state copy localized", () => {
    expect(popupMessages["en-us"]!.pageUnavailableTitle).toBe("Page unavailable");
    expect(popupMessages["zh-cn"]!.pageErrorTitle).toBe("连接异常");
  });
});
