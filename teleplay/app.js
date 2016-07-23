'use strict';

//debug logger
debug.enable("teleplay:*")
var logD = debug("teleplay:debug");
var logE = debug("teleplay:error")

//init ace editor
var editor = ace.edit("editor");
editor.setTheme("ace/theme/monokai");
editor.getSession().setMode("ace/mode/javascript");
editor.getSession().setUseWrapMode(true);


//vue.js
new Vue({
    el: '#app',
    data: {
        state: "stopped"
    },
    methods: {
        start: function (params) {
            let module = { exports: {} };
            try {
                module.exports = {
                    apiToken: "254094951:AAEc87cJdHXnjGlv5sWuncB7BXag19s4orM",                    
                    onMessage: function (text, update) {
                        return Promise.resolve("you said: " + text);
                    }
                }

                //compile handler
                eval(editor.getValue());
            } catch (e) {
                logE(e);
                return;
            }
            this.state = "started";

            run(module.exports, this);

            logD("bot started.");
        },
        stop: function (params) {
            this.state = "stopping";
        }
    }
})

let run = Promise.coroutine(function* (handler, stateHolder) {

    let execute = Promise.coroutine(function* (result) {
        try {
            let reply = yield handler.onMessage(result["message"]["text"], result);
            yield superagent
                .get(`https://api.telegram.org/bot${handler.apiToken}/sendMessage`)
                .query({
                    chat_id: result["message"]["chat"]["id"],
                    text: reply
                })
            logD(`handled a message: ${result["message"]["text"]} with reply: ${reply}`)
        } catch (e) {
            logE(e);
        }
    });

    let offset = localStorage.getItem(`checkpoint:${handler.apiToken}`) || -1;

    while (stateHolder.state === "started") {
        try {
            logD(`fetch updates, offset = ${offset}`);
            let res = yield superagent
                .get(`https://api.telegram.org/bot${handler.apiToken}/getUpdates`)
                .query({
                    offset: offset,
                    limit: 10,
                    timeout: 5
                })
            let body = res.body;
            if (body.ok) {
                let results = body.result.filter((r) => { return r.message && r.message.text; });
                Promise.map(results, execute, { concurrency: handler.concurrency || 5 })
                if (body.result.length > 0) {
                    offset = body.result[body.result.length - 1]['update_id'] + 1
                    localStorage.setItem(`checkpoint:${handler.apiToken}`, offset);
                }
            } else {
                logE("result is not okay, will wait  for a while and retry again");
            }
        } catch (e) {
            logE(e);
        } finally {
            if (stateHolder.state === "started") {
                continue;
            } else {
                break;
            }
        }
    }

    stateHolder.state = "stopped";
    logD("bot stopped");

});


