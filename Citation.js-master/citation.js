var fs = require("fs");
var url = require("url");
var path = require("path");
var async = require("async");
var request = require("request");
var cheerio = require("cheerio");

var defaultExtensions = [
  require("./lib/meta"),
  require("./lib/wikipedia")
];

// new Mla(String, [])
function Mla(site, extensions) {
  this.extensions = [];

  // Use default etensions.
  this.useExtensions(defaultExtensions);

  // Construct using site.
  if (site)
    this.setSite(site);

  if (extensions) {
    this.useExtensions(extensions);
  }
}

// Mla#setSite(String)
Mla.prototype.setSite = function (site) {
  this.site = site;
};

// Mla#useExtensions([])
Mla.prototype.useExtensions = function (extensions) {
  var self = this;
  extensions.forEach(function (extension) {
    self.extensions.push(extension);
  });
};

Mla.getOrganization = function(site, cb) {
  var domainExp = site.match(/https?:\/\/([a-z\.\-]+)/);

  if (typeof domainExp === "undefined" || !domainExp) {
    return cb(new Error("Invalid URL"), null);
  }

  var domain = domainExp[1];
  
  fs.readFile(__dirname + "/organizations.json", function (err, data) {
    if (err) {
      cb(err, undefined);
    }
    else {
      var organizationName;
      var organizations = JSON.parse(data.toString());
      
      for (var organizationDomain in organizations) {
        // e.g. finds 'google.com' in 'maps.google.com'
        if ((new RegExp(organizationDomain + "$")).test(domain)) {
          organizationName = organizations[organizationDomain];
        }
      }
      
      if (organizationName) {
        cb(undefined, organizationName);
      }
      else {
        cb(undefined, null);
      }
    }
  });
};

// Mla#getReference(function(err, citation))
Mla.prototype.getReference = function (callback) {
  var self = this;
  var site = this.site;

  async.waterfall([
    
    function(cb) {
      request(site, function (err, res, body) {
        if (err) console.log(err);
        cb(err, res, body);
      });
    },
    
    function(res, body, cb) {
      Mla.getOrganization(site, function (err, organization) {
        cb(err, res, body, organization);
      });
    },
    
    function(res, body, organization, cb) {
      var citation = {};
      var pdf = false;

      if (/application\/pdf/i.test(res.headers["content-type"])) {
        pdf = true;
      }
      else {
        var $ = cheerio.load(body);
      }

      /* default values */

      // MLA Field 1: author
      citation.author = null;

      // MLA field 2: title
      if (!pdf) {
        citation.title = $("head title").text();
      }
      else {
        citation.title = decodeURIComponent(path.basename(url.parse(site).pathname));
      }

      // MLA field 3: organization
      citation.organization = organization;

      // MLA field 4: media type
      if (pdf) {
        citation.type = "Web [PDF]";
      }
      else {
        citation.type = "Web";
      }

      // MLA field 5: date accessed
      citation.accessDate = (new Date()).toDateString();

      // MLA (non-standard, see README) field 6: URL
      citation.url = site;

      if (!pdf) {
        self.extensions.forEach(function (extension) {
          if (extension.check($))
            return extension.call($, citation);
          else
            return null;
        });
      }

      callback(null, citation);
    }],
    
    function(err, citation) {
      if (err)
        callback(err);
    });
};

// Mla#convertToMla(citation)
Mla.convertToMla = function (citation) {
  var MLA = "";

  var mlaFields = [];

  // 1
  mlaFields.push(citation.author);
  // 2
  mlaFields.push(citation.title);
  // 3
  mlaFields.push(citation.organization);
  // 4
  mlaFields.push(citation.type);
  // 5
  mlaFields.push(citation.accessDate);
  // 6
  mlaFields.push("<" + citation.url + ">");

  mlaFields.forEach(function (field) {
    console.log(field);
    if (typeof (field) === undefined || field === null) {
      ;
    }
    else {
      MLA += field + ". ";
    }
  });

  return MLA;
};

// Mla#getMlaReference(function(err, citation))
Mla.prototype.getMlaReference = function (cb) {
  this.getReference(function (err, citation) {
    if (err) {
      cb(err, undefined);
    } else {
      var MLA = Mla.convertToMla(citation);
      cb(undefined, MLA);
    }
  });
};

module.exports = Mla;
