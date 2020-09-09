const expect = require("chai").expect;
const mockfs = require("mock-fs");
const fs = require("fs");
const { WebSocket, Server } = require("mock-socket");
const thinkdevice = require("../thinkdevice");

describe("thinkdevice.js tests", () => {
  describe("safeParseJSON(data)", () => {
    it("should parse valid JSON", () => {
      //      const result = thinkdevice.fullLockPath('/dev/testdev0');
      //      expect(result).to.equal('I do not know');
      const result = thinkdevice.safeParseJSON(
        '{"number":5,"string":"test string","array":[]}'
      );
      expect(JSON.stringify(result)).to.equal(
        '{"number":5,"string":"test string","array":[]}'
      );
    });
    it("should return error for invalid JSON", () => {
      const result = thinkdevice.safeParseJSON('{"this": is broken JSON');
      expect(JSON.stringify(result)).to.equal(
        '{"error":{"message":"Unexpected token i in JSON at position 9"}}'
      );
    });
  });

  // UNDONE: most unit tests NYI
});
