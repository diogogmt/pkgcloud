/*
 * server.js: Base server from which all pkgcloud servers inherit from
 *
 * (C) 2011 Nodejitsu Inc.
 *
 */

var utile = require('utile'),
    model = require('../base/model'),
    computeStatus = require('../../common/status').compute;

var Server = exports.Server = function (client, details) {
  model.Model.call(this, client, details);
};

utile.inherits(Server, model.Model);


Server.prototype.set = function (key, value) {
  console.log("Server.Base set");
  console.log("key: ", key);
  console.log("value: ", value);

  this[key] = value;

}

Server.prototype.refresh = function (callback) {
  console.log("Base.Server refresh");
  var self = this;
  return self.client.getServer(this, function (err, server) {
    if (!err) self._setProperties(server.original);
    return callback.apply(this, arguments);
  });
};

Server.prototype.create = function (callback) {
  console.log("Base.Server create");
  console.log("callback: ", callback);
  return this.client.createServer(this, callback);
};

Server.prototype.destroy = function (callback) {
  return this.client.destroyServer(this, callback);
};

Server.prototype.reboot = function (callback) {
  return this.client.rebootServer(this, callback);
};

Server.prototype.start = function (callback) {
  return this.client.startServer(this, callback);
};

Server.prototype.stop = function (callback) {
  console.log("Server.Base stop");
  console.log("calling stopServer");
  return this.client.stopServer(this, callback);
};

Server.prototype.rename = function (callback) {
  console.log("Server.Base rename");
  console.log("calling renameServer");
  return this.client.renameServer(this, callback);
};

Server.prototype.resize = function () {
  var args = [this].concat(Array.prototype.slice.call(arguments));
  this.client.resizeServer.apply(this.client, args);
};

Server.prototype.STATUS = computeStatus;