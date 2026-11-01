import { describe, it, expect } from "vitest";
import { BANKS, encodeTel, findBankByText, findBankByName } from "../lib/banks";

describe("encodeTel", () => {
  it("percent-encodes # and keeps * literal", () => {
    expect(encodeTel("*737#")).toBe("tel:*737%23");
    expect(encodeTel("*5573#")).toBe("tel:*5573%23");
  });
  it("handles codes with multiple #", () => {
    expect(encodeTel("*737*6*1#")).toBe("tel:*737*6*1%23");
  });
});

describe("BANKS catalog", () => {
 it("includes the user-named banks with verified USSD codes", () => {
    const byName = new Map(BANKS.map((b) => [b.name, b]));
    expect(byName.get("GTBank")?.ussd).toBe("*737#");
    expect(byName.get("Access Bank")?.ussd).toBe("*901#");
    expect(byName.get("Zenith Bank")?.ussd).toBe("*966#");
    expect(byName.get("UBA")?.ussd).toBe("*919#");
    expect(byName.get("FirstBank")?.ussd).toBe("*894#");
    expect(byName.get("Sterling Bank")?.ussd).toBe("*822#");
    expect(byName.get("FCMB")?.ussd).toBe("*329#");
    expect(byName.get("Union Bank")?.ussd).toBe("*826#");
    expect(byName.get("OPay")?.ussd).toBe("*955#");
  });

  it("marks Kuda as app-only with no USSD/tel", () => {
    const kuda = BANKS.find((b) => b.name === "Kuda");
    expect(kuda?.appOnly).toBe(true);
    expect(kuda?.ussd).toBe("");
    expect(kuda?.tel).toBe("");
  });

  it("has a non-empty tel link for every non-app-only bank", () => {
    for (const b of BANKS) {
      if (b.appOnly) continue;
      expect(b.tel).toMatch(/^tel:.*%23$/);
    }
  });
});

describe("findBankByText", () => {
  it("matches display names and aliases as whole tokens", () => {
    expect(findBankByText("Credit alert from GTBank: 5,000")?.name).toBe("GTBank");
    expect(findBankByText("Sent via GTB transfer")?.name).toBe("GTBank");
    expect(findBankByText("Guaranty Trust Bank N5,000 received")?.name).toBe("GTBank");
    expect(findBankByText("You have sent UBA N1,000")?.name).toBe("UBA");
    expect(findBankByText("Moniepoint transfer successful")?.name).toBe("Moniepoint");
  });

  it("is case-insensitive", () => {
    expect(findBankByText("access bank debit")?.name).toBe("Access Bank");
    expect(findBankByText("ZENITH BANK")?.name).toBe("Zenith Bank");
  });

  it("does not match aliases buried inside other words", () => {
    // "uba" must not match inside "scuba" or "reuben"
    expect(findBankByText("scuba diving trip")).toBeUndefined();
    expect(findBankByText("reuben called me")).toBeUndefined();
    // "gtb" must not match inside "gtbank" as a different token — but "gtbank" itself is GTBank
    expect(findBankByText("gtbank")).toBeDefined();
  });

  it("returns undefined for unrelated text", () => {
    expect(findBankByText("hello, how are you today?")).toBeUndefined();
    expect(findBankByText("")).toBeUndefined();
  });
});

describe("findBankByName", () => {
  it("resolves by display name", () => {
    expect(findBankByName("GTBank")?.ussd).toBe("*737#");
    expect(findBankByName("Zenith Bank")?.ussd).toBe("*966#");
  });

  it("resolves by alias (case-insensitive)", () => {
    expect(findBankByName("gtb")?.name).toBe("GTBank");
    expect(findBankByName("FCMB")?.name).toBe("FCMB");
  });

  it("returns undefined for unknown banks", () => {
    expect(findBankByName("NotABank")).toBeUndefined();
  });
});
