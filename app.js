var through = require('through2');
var gutil = require('gulp-util');
var PluginError = gutil.PluginError;
var _ = require('underscore');

var vinyl = require('vinyl-fs');
var fs = require('fs');
var bower_ = require('bower'),
    bower = bower_.commands;

var async = require('async');
//sonsole.log(bower_.config);
var path = require('path');

// Consts
const PLUGIN_NAME = 'gulp-bower-assets';

// Exporting the plugin main function
module.exports = function(config) {
    if (!config) config = {};
    _.defaults(config, {
        prefix: false,
        bower: {}
    });

    _.extend(bower_.config, config.bower);

    var bowerDir = path.join(bower_.config.cwd, bower_.config.directory);


    return through.obj(function(file, enc, cb) {
        if (file.isNull())
            return cb(null, file);

        var assets, save = this,
            base = path.dirname(file.path);

        if (file.isBuffer())
            assets = JSON.parse(file.contents.toString());

        if (file.isStream()) {}

        async.each(_.pairs(assets), function(pack, exit) {
            var name;

            if (_.isFunction(config.prefix)) name = _.partial(config.prefix, _, pack[0]);
            else if (_.isString(config.prefix)) name = function() {
                return config.prefix.replace('{{PREFIX}}', pack[0])
            };
            else if (config.prefix === false)
                name = function(filebase) {
                    return filebase;
                };
            else name = function(filebase) {
                return [pack[0], filebase].join('.');
            };


            async.each(_.pairs(pack[1]), function(segment, endOnePrefixPack) {

                var temp = segment[0].split('@'),
                    file = temp[0],
                    action = temp[1],
                    files = vinyl.src(_.map(segment[1], function(one) {
                        return path.join(bowerDir, one);
                    }), {
                        cwd: bowerDir,
                        buffer: true,
                        read: true,
                        //passthrough: true
                    });

                switch (action) {
                    case 'concat':
                        var content = [],
                            error = [];
                        files.pipe(through.obj(function(file, enc, done) {
                            if (file.isNull()) {
                                bower.info(file.relative, null, {
                                    offline: true
                                }).on('end', function(info) {
                                    if (!info) {
                                        gutil.log(PLUGIN_NAME, 'package not found', gutil.colors.magenta(file.relative));
                                        error.push(file.relative);
                                        return done();
                                    }
                                    gutil.log(PLUGIN_NAME, 'package found and inserted', gutil.colors.magenta(info.name + '#' + info.latest.version));
                                    content.push(fs.readFileSync(path.join(bowerDir, info.name, info.latest.main)))
                                    done();
                                });
                            } else {
                                content.push(file.contents);
                                content.push(new Buffer('\n'));
                                done();
                            }
                        }, function(close) {
                            var newFile = new gutil.File({
                                //cwd: "/",
                                //base: base,
                                path: path.join(base, name(file)),
                                contents: Buffer.concat(content)
                            });



                            save.push(newFile);
                            endOnePrefixPack();
                            close();
                        }));
                        break;
                    case 'copy':
                        files.pipe(through.obj(function(file_, enc, done) {
                            var newFile = new gutil.File({
                                //cwd: "/",
                                //base: "",
                                path: path.join(base, name(file), file_.relative),
                                contents: file_.contents
                            });
                            save.push(newFile);
                            done();
                        }, function(a){
                            a();
                            endOnePrefixPack();
                        }));
                        break;

                }
            }, exit);
        }, function() {
            cb(null)
        });
    });
};