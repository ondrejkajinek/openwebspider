var http = require("http");
var https = require("https");
var logger = require("../_utils/logger");


module.exports = function ()
{
    var that = this;


    /** getPage
     *
     * @param urlObject
     * @param interestedPlugins
     * @param callback
     *
     */
    this.getPage = function (urlObject, interestedPlugins, callback)
    {
        try
        {
            var headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36" // that.CONF.get("CRAWLER_NAME") + "/" + that.CONF.VERSION + " (http://www.openwebspider.org)"
            };

            if(urlObject["ETag"] !== undefined)
            {
                headers["If-None-Match"] = urlObject["ETag"];
            }

            if(urlObject["lastModified"] !== undefined)
            {
                headers["If-Modified-Since"] = urlObject["lastModified"];
            }

            var caller_proto = http;
            if (urlObject["protocol"] == 'https:'){
                caller_proto = https;
            }

            var req = caller_proto.request({
                "hostname": urlObject["hostname"],
                "port": urlObject["port"],
                "path": urlObject["path"],
                headers: headers
            }, function (response)
            {
                var data = "";
                var invalidData = false;

                // base redirects support
                if (response["headers"] && response["headers"]["location"])
                {
                    that.addURL(response["headers"]["location"], urlObject);
                }

                if (
                        (response.statusCode !== 200 ) ||
                        (response.headers["content-length"] && parseInt(response.headers["content-length"]) > that.CONF.get("MAX_PAGE_SIZE") * 1000 ) ||
                        (response.headers["content-type"] && ( ["application/msword"].indexOf(response.headers["content-type"]) ) != -1)
                    )
                {
                    req.abort();
                    response.req.end();
                    callback(null, response, undefined, 'status is ' + response.statusCode + ' content len: ' + response.headers["content-length"] + " content_type: " + response.headers["content-type"]);
                    return;
                }

                if (response.headers["content-type"].substr(0, 5) === "text/")
                {
                    response.setEncoding('utf8');
                }
                else
                {
                    response.setEncoding('binary');
                }

                // calls the plugins' aroundGetPage
                that.pluginAsyncCall("aroundGetPage", [urlObject, response], interestedPlugins, function (ret)
                {
                    // list of plugins interested in downloading and indexing this page
                    var stillInterestedPlugins = [], skipPage = false;

                    for (var pluginName in ret)
                    {
                        if (ret[pluginName][0] === true)
                        {
                            stillInterestedPlugins.push(pluginName);
                        }
                        else if (ret[pluginName][0] === false && ret[pluginName][1] && ret[pluginName][1]["action"] === that.plugins_conts.PLUGIN_SKIP_PAGE)
                        {
                            skipPage = true;
                            break;
                        }
                    }
                    if (stillInterestedPlugins.length === 0 || skipPage === true)
                    {
                        // none is still interested in this page!
                        req.abort();
                        response.req.end();
                        callback(null, response, undefined, "no interested plugin");
                    }
                    else
                    {
                        // there is someone interested in this page
                        response.on('data', function (chunk)
                        {
                            if (invalidData === true)
                            {
                                return;
                            }
                            data += chunk;

                            that.downloadedBytes += chunk.length;

                            if (that.stopSignal === true ||
                                data.length > that.CONF.get("MAX_PAGE_SIZE") * 1000)
                            {
                                invalidData = true;
                                data = "";

                                req.abort();
                                response.req.end();
                            }
                        });

                        response.on('end', function ()
                        {
                            callback(data, response, stillInterestedPlugins);
                        });
                    }
                });

            });

            req.on('socket', function (socket)
            {
                socket.setTimeout(that.CONF.get("SOCKET_TIMEOUT"));
                socket.on("timeout", function ()
                {
                    req.abort();
                    req.end();
                });
            });

            req.on("error", function ()
            {
                // this is called, for example, after socket::timeout
                callback(null);
            });

            req.end();
        }
        catch (e)
        {
            callback(null);
        }
    };

};
