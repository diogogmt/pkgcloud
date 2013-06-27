/*
 * servers.js: Instance methods for working with servers from AWS Cloud
 *
 * (C) 2012 Nodejitsu Inc.
 *
 */
var async = require('async'),
    request  = require('request'),
    base     = require('../../../core/compute'),
    pkgcloud = require('../../../../../lib/pkgcloud'),
    errs     = require('errs'),
    compute  = pkgcloud.providers.amazon.compute;

//
// ### function getVersion (callback)
// #### @callback {function} f(err, version).
//
// Gets the current API version
//
exports.getVersion = function getVersion(callback) {
  var self = this;
  process.nextTick(function() {
    callback(null, self.version);
  });
};

//
// ### function getLimits (callback)
// #### @callback {function} f(err, version).
//
// Gets the current API limits
//
exports.getLimits = function getLimits(callback) {
  return errs.handle(
    errs.create({ message: "AWS's API is not rate limited" }),
    callback
  );
};


//
// ### function getServers (callback)
// #### @callback {function} f(err, servers). `servers` is an array that
// represents the servers that are available to your account
//
// Lists all servers available to your account.
//
exports.getServers = function getServers(callback) {
  var self = this;
  return self.query('DescribeInstances', {}, function (err, body, res) {
    
    if (err) {
      return callback(err);
    }

    var servers = [];

    if (!body || !body.reservationSet || !body.reservationSet.item) {
      return callback(null, []);
    }

    self._toArray(body.reservationSet.item).forEach(function (reservation) {
      // console.log("\n\n\n----->reservation: ");
      // console.log(reservation.instancesSet.item);
      // console.log("\n\n----------\n\n");
      self._toArray(reservation.instancesSet.item).forEach(function (instance) {
        servers.push(instance);
      });
    });


    callback(null, servers.map(function (server) {
              return new compute.Server(self, server);
    }), res);

  });
};

//
// ### function createServer (options, callback)
// #### @opts {Object} **Optional** options
// ####    @name     {String} **Optional** the name of server
// ####    @image    {String|Image} the image (AMI) to use
// ####    @flavor   {String|Flavor} **Optional** flavor to use for this image
// #### @callback {Function} f(err, server).
//
// Creates a server with the specified options. The flavor
// properties of the options can be instances of Flavor
// OR ids to those entities in AWS.
//
exports.createServer = function createServer(options, callback) {
  console.log("pkgcloud AMAZON.createServer");
  // if (typeof options === 'function') {
  //   callback = options;
  //   options  = {};
  // }

  console.log("\n\n\n--->options.refresh: ", options.refresh);

  options = options || {}; // no args
  var self = this,
      meta = { name: options.name || '' },
      createOptions = {
        UserData: new Buffer(JSON.stringify(meta)).toString('base64'),
        MinCount: 1,
        MaxCount: 1
      },
      securityGroup,
      securityGroupId;

  if (!options.image) {
    return errs.handle(
      errs.create({
        message: 'options.image is a required argument.'
      }),
      callback
    );
  }

  securityGroup = this.securityGroup || options['SecurityGroup'];
  if (securityGroup) {
    createOptions['SecurityGroup'] = securityGroup;
  }

  securityGroupId = this.securityGroupId || options['SecurityGroupId'];
  if (securityGroupId) {
    createOptions['SecurityGroupId'] = securityGroupId;
  }

  createOptions.ImageId = options.image instanceof base.Image
    ? options.image.id
    : options.image;

  if (options.flavor) {
    createOptions.InstanceType = options.flavor instanceof base.Flavor
      ? options.flavor.id
      : options.flavor;
  }

  if (options.keyname || options.KeyName) {
    createOptions.KeyName = options.keyname || options.KeyName;
  }

  if (options.zone || options['Placement.AvailabilityZone']) {
    createOptions['Placement.AvailabilityZone'] = options.zone
      || options['Placement.AvailabilityZone'];
  }

  if (options.subnet) {
    createOptions['SubnetId'] = options.subnet;
  }

  console.log("createOptions: ", createOptions);

  return this.query(
    'RunInstances',
    createOptions,
    function (err, body, res) {
      console.log("\n\n---> RunInstances response");
      var server;
      if (err) {
        return callback(err);
      }

      var instance = body.instancesSet.item;

      if (options instanceof base.Server) {
        console.log("updating base server");
        options._setProperties(instance);
        console.log("\n\n\n--->options.refresh: ", options.refresh);

        server = options;
        console.log("server.refresh: ", server.refresh);
      } else {
        console.log("going to create a new compute.Server");
        server = new compute.Server(self, instance);
      }
    
      // self._toArray(body.instancesSet.item).forEach(function (instance) {
      //   instance.meta = meta;
      //   if (options instanceof base.Server) {
      //     console.log("updating base server");
      //     options._setProperties(instance);
      //   } else {
      //     console.log("going to create a new compute.Server");
      //     server = new compute.Server(self, instance);
      //   }
      // });

      console.log("calling callback");
      callback(null, server, res);
    }
  );
};

//
// ### function destroyServer(server, callback)
// #### @server {Server|String} Server id or a server
// #### @callback {Function} f(err, serverId).
//
// Destroy a server in AWS.
//
exports.destroyServer = function destroyServer(server, callback) {
  var serverId = server instanceof base.Server ? server.id : server;

  return this.query(
    'TerminateInstances',
    { InstanceId: serverId },
    function (err, body, res) {
      return err
        ? callback && callback(err)
        : callback && callback(null, { ok: serverId }, res);
    }
  );
};

//
// ### function getServer(server, callback)
// #### @server {Server|String} Server id or a server
// #### @callback {Function} f(err, serverId).
//
// Gets a server in AWS.
//
exports.getServer = function getServer(server, callback) {
  var self     = this,
      serverId = server instanceof base.Server ? server.id : server;

  return this.query(
    'DescribeInstances',
    {
      'InstanceId.1' : serverId,
      'Filter.1.Name': 'instance-state-code',
      'Filter.1.Value.1': 0, // pending
      'Filter.1.Value.2': 16, // running
      'Filter.1.Value.3': 32, // shutting down
      'Filter.1.Value.4': 64, // stopping
      'Filter.1.Value.5': 80 // stopped
    },
    function (err, body, res) {
      console.log("DescribeInstances callback");
      console.log("err: ", err);
      console.log("body: ", body);
      var server;

      if (err) {
        return callback(err);
      }

      self._toArray(body.reservationSet.item).forEach(function (reservation) {
        console.log("reservation: ", reservation);
        self._toArray(reservation.instancesSet.item).forEach(function (instance) {
          console.log('instance: ', instance);
          server = instance;
        });
      });

      if (server === undefined) {
        return callback(new Error('Server not found'));
      }

      callback(null, new compute.Server(self, server));
    }
  );
};


//
// ### function rebootServer (server, options, callback)
// #### @server   {Server|String} The server to reboot
// #### @callback {Function} f(err, server).
//
// Reboots a server
//
exports.rebootServer = function rebootServer(server, callback) {
  console.log("pkgcloud AMAZON.rebootServer");

  var serverId = server instanceof base.Server ? server.id : server;

  console.log("serverId: ", serverId);

  return this.query(
    'RebootInstances',
    { InstanceId: serverId },
    function (err, body, res) {
      return err
        ? callback(err)
        : callback(null, { ok: serverId }, res);
    }
  );
};



//
// ### function stopServer (server, options, callback)
// #### @server   {Server|String} The server to stop
// #### @callback {Function} f(err, server).
//
// Stops a server
//
exports.stopServer = function stopServer(server, callback) {
  console.log("pkgcloud AMAZON.stopServer");

  var serverId = server instanceof base.Server ? server.id : server;

  console.log("serverId: ", serverId);

  return this.query(
    'StopInstances',
    { InstanceId: serverId },
    function (err, body, res) {
      return err
        ? callback(err)
        : callback(null, { ok: serverId }, res);
    }
  );
};


//
// ### function startServer (server, options, callback)
// #### @server   {Server|String} The server to start
// #### @callback {Function} f(err, server).
//
// Stops a server
//
exports.startServer = function startServer(server, callback) {
  console.log("pkgcloud AMAZON.startServer");
  var serverId = server instanceof base.Server ? server.id : server;

  console.log("serverId: ", serverId);

  return this.query(
    'StartInstances',
    { InstanceId: serverId },
    function (err, body, res) {
      return err
        ? callback(err)
        : callback(null, { ok: serverId }, res);
    }
  );
};

//
// ### function renameServer(server, name, callback)
// #### @server {Server|String} Server id or a server
// #### @name   {String} New name to apply to the server
// #### @callback {Function} f(err, server).
//
// Renames a server
//
exports.renameServer = function renameServer(server, name, callback) {
  console.log("pkgcloud AMAZON.renameServer");

  if (server instanceof base.Server) {
    console.log("we have a base.Server");
    id = server.id
    callback = name;
    name = server.name;
  } else {
    id = server;
  }

  console.log("id: ", id);
  console.log("name: ", name);
  console.log("callback: ", callback);

  return this.query(
    'CreateTags',
    { 
      ResourceId: id,
      'Tag.Key'   : 'Name',
      'Tag.Value' : name,
    },
    function (err, body, res) {
      return err
        ? callback(err)
        : callback(null, { ok: id }, res);
    }
  );
};
