const expect = require('chai').expect;
const mockfs = require('mock-fs');
const fs = require('fs');
const nock = require('nock');
const sinon = require('sinon');
const mockery = require('mockery');
const { MockEvent, EventSource } = require('mocksse');
//const EventSource = require('eventsource');
const thinkdevice = require('../thinkdevice');

describe('thinkdevice.js tests', () => {
  before(function () {
    console.log('before');
    mockery.enable();
    mockery.registerMock('eventsource', 'mocksse');
  });
  after(function () {
    console.log('after');
    mockery.deregisterMock('eventsource');
    mockery.disable();
  });

  describe('safeParseJSON(data)', () => {
    it('should parse valid JSON', () => {
//      const result = thinkdevice.fullLockPath('/dev/testdev0');
//      expect(result).to.equal('I do not know');
      const result = thinkdevice.safeParseJSON('{"number":5,"string":"test string","array":[]}');
      expect(JSON.stringify(result)).to.equal('{"number":5,"string":"test string","array":[]}');
    });
    it('should return error for invalid JSON', () => {
      const result = thinkdevice.safeParseJSON('{"this": is broken JSON');
      expect(JSON.stringify(result)).to.equal('{"error":{"message":"Unexpected token i in JSON at position 9"}}');
    });
  });

  describe('connect(deviceProperties, cb)', function() {
    it('invalid device configuration file', (done) => {
      new MockEvent({
        url: '/sub/randomstring',
        setInterval: 10,
        responses: [
          { lastEventId: 'event Id One', type: 'yourEvent', data: { yourProp: 'Wish I was done!' } },
          { lastEventId: 'event Id Two', type: 'yourEvent', data: { yourProp: 'Oh, wow, nearly done!' } }
        ]
      });
      mockfs({
        'device.json': 'invalid JSON'
      });
      const scopeApi = nock('https://api.thinkautomatic.io')
        .post('/v1/devices')
        .reply(200, {
          deviceId:1234,
          eventStreamUrl:'/sub/randomstring'
        })
        .post('/v1/devices/1234/keepAlive')
        .reply(200, {
          deviceId:1234,
          eventStreamUrl:'/sub/randomstring'
        });

      thinkdevice.connect({}, function(data){
        expect(String(fs.readFileSync('device.json'))).to.equal('{"deviceId":1234,"eventStreamUrl":"/sub/randomstring"}');
        mockfs.restore();
        done();
      });
    });
/*
    it('valid device configuration file, but not authorized', (done) => {
      mock({
        'device.json': '{"deviceId":1234}'
      });
      const scope = nock('https://api.thinkautomatic.io')
        .post('/v1/devices/1234')
        .reply(200, {
          error: {
            code: 3010,
            message: "Unauthorized"
          }
        });

      thinkdevice.connect({}, function(data){
        expect(fs.existsSync('device.json')).to.be.false;
        mock.restore();
        done();
      });
    });

    it('registered previously, unable to update', (done) => {
      mock({
        'device.json': '{"deviceId":1234}'
      });
      const scope = nock('https://api.thinkautomatic.io')
        .patch('/v1/devices/1234')
        .reply(200, {
          error: {
            code: 3000,
            message: "Unable to update device"
          }
        });

      thinkdevice.connect({}, function(data){
        expect(String(fs.readFileSync('device.json'))).to.equal('{"deviceId":1234}');
        mock.restore();
        done();
      });
    });
  */
  });
});
