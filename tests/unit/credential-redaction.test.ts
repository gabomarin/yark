import { describe, expect, it } from "vitest";
import {
  REDACTED_SECRET,
  collectKnownSecrets,
  isIniPasswordKey,
  omitIniPasswordSettings,
  sanitizeAppEvent,
  sanitizeDiagnosticText,
  sanitizeDiagnosticValue,
} from "@shared/credential-redaction";

describe("credential diagnostic sanitizer", () => {
  it("omits GUS password settings instead of reprinting them", () => {
    const raw = [
      "[ServerSettings]",
      "ServerAdminPassword=hunter2-secret",
      "ServerPassword=\"join-secret\"",
      "MaxPlayers=70",
      "RCONPort=27020",
    ].join("\n");
    const sanitized = omitIniPasswordSettings(raw);
    expect(sanitized).not.toMatch(/ServerAdminPassword/i);
    expect(sanitized).not.toMatch(/ServerPassword/i);
    expect(sanitized).not.toContain("hunter2-secret");
    expect(sanitized).toContain("MaxPlayers=70");
    expect(sanitized).toContain("RCONPort=27020");
  });

  it("drops section headers whose only assignments were password settings", () => {
    const raw = [
      "[ServerSettings]",
      "ServerAdminPassword=hunter2-secret",
      "[SessionSettings]",
      "SessionName=Island",
    ].join("\n");
    const sanitized = omitIniPasswordSettings(raw);
    expect(sanitized).not.toContain("[ServerSettings]");
    expect(sanitized).toContain("[SessionSettings]");
    expect(sanitized).toContain("SessionName=Island");
  });

  it("omits password keys from pretty-printed config dumps", () => {
    const raw = [
      "{",
      '  "sessionName": "Island",',
      '  "adminPassword": "hunter2-secret",',
      '  "maxPlayers": 70',
      "}",
    ].join("\n");
    const sanitized = omitIniPasswordSettings(raw);
    expect(sanitized).not.toContain("adminPassword");
    expect(sanitized).not.toContain("hunter2-secret");
    expect(sanitized).toContain('"sessionName": "Island"');
  });

  it("omits prefixed runtime lines that are only a GUS password assignment", () => {
    const raw =
      "[2026-08-29T00:00:00.000Z] [stdout] ServerAdminPassword=hunter2-secret";
    expect(sanitizeDiagnosticText(raw)).toBe("");
  });

  it("redacts inline assignments that are not standalone GUS lines", () => {
    const raw = "INI write failed ServerAdminPassword=hunter2-secret";
    const sanitized = sanitizeDiagnosticText(raw);
    expect(sanitized).not.toContain("hunter2-secret");
    expect(sanitized).toContain(`ServerAdminPassword=${REDACTED_SECRET}`);
  });

  it("redacts assignment values that contain & or spaces when quoted", () => {
    const sanitized = sanitizeDiagnosticText(
      'INI write failed ServerAdminPassword="p&ss word"',
    );
    expect(sanitized).not.toContain("p&ss");
    expect(sanitized).toContain(`ServerAdminPassword=${REDACTED_SECRET}`);
  });

  it("redacts bearer tokens and API keys", () => {
    const raw =
      "Authorization: Bearer tok_abc and x-api-key=cf_secret";
    const sanitized = sanitizeDiagnosticText(raw);
    expect(sanitized).not.toContain("tok_abc");
    expect(sanitized).not.toContain("cf_secret");
    expect(sanitized).toContain(REDACTED_SECRET);
  });

  it("redacts known plaintext secrets even without a key name", () => {
    const sanitized = sanitizeDiagnosticText(
      "failed auth with hunter2-secret on RCON",
      ["hunter2-secret"],
    );
    expect(sanitized).not.toContain("hunter2-secret");
    expect(sanitized).toContain(REDACTED_SECRET);
  });

  it("does not redact a known secret as a substring of a longer word", () => {
    const sanitized = sanitizeDiagnosticText(
      "administrator login failed",
      ["admin"],
    );
    expect(sanitized).toBe("administrator login failed");
  });

  it("omits password fields from config objects", () => {
    const sanitized = sanitizeDiagnosticValue({
      sessionName: "Island",
      adminPassword: "hunter2-secret",
      serverPassword: "join-secret",
      maxPlayers: 70,
      excerpt: "ServerAdminPassword=hunter2-secret\nMaxPlayers=70",
    });
    expect(sanitized).toEqual({
      sessionName: "Island",
      maxPlayers: 70,
      excerpt: "MaxPlayers=70",
    });
  });

  it("sanitizes event messages and details together", () => {
    const event = sanitizeAppEvent({
      message: "GUS dump\nServerAdminPassword=hunter2-secret",
      details: {
        excerpt: "ServerPassword=join-secret\nRCONPort=27020",
        context: { adminPassword: "hunter2-secret", exitCode: 1 },
      },
    });
    expect(event.message).not.toContain("hunter2-secret");
    expect(event.message).not.toMatch(/ServerAdminPassword/i);
    expect(event.details).toEqual({
      excerpt: "RCONPort=27020",
      context: { exitCode: 1 },
    });
  });

  it("collects admin and join passwords of sufficient length", () => {
    expect(
      collectKnownSecrets([
        { adminPassword: "abcd", serverPassword: "join99" },
        { adminPassword: "abc", serverPassword: null },
        { adminPassword: "admin1234", serverPassword: "join99" },
      ]),
    ).toEqual(["abcd", "join99", "admin1234"]);
  });

  it("recognizes GUS password keys", () => {
    expect(isIniPasswordKey("ServerAdminPassword")).toBe(true);
    expect(isIniPasswordKey("MaxPlayers")).toBe(false);
  });
});
