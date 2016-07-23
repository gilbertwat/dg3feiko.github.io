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
        state: "stop"
    },
    methods: {
        start: function (params) {
            let module = { exports: {} };
            try {
                module.exports = {
                    apiToken: "254094951:AAEc87cJdHXnjGlv5sWuncB7BXag19s4orM",
                    concurrency: 2,
                    onMessage: function (text, update) {
                        return Promise.resolve("you said: " + text);
                    }
                }

                //compile handler
                // eval(editor.getValue());
            } catch (e) {
                logE(e);
                return; //TODO     
            }
            
            run(module.exports);
            
            this.state = "start";
        },
        stop: function (params) {
            this.state = "stop";
        }
    }
})

let run = Promise.coroutine(function* (handler) {

    let execute = Promise.coroutine(function* (result) {
        let reply = yield handler.onMessage(result["message"]["text"], result);
        yield superagent
            .get(`https://api.telegram.org/bot${handler.apiToken}/sendMessage`)
            .query({
                chat_id: result["message"]["chat"]["id"],
                text: reply
            })
        logD("handled a message: " + result)
    });

    let offset = localStorage.getItem(`checkpoint:${handler.apiToken}`) || -1;

    while (true) {
        try {
            logD(`fetch updates, offset = ${offset}`);
            let res = yield superagent
                .get(`https://api.telegram.org/bot${handler.apiToken}/getUpdates`)
                .query({
                    offset: offset,
                    limit: 10,
                    timeout: 10
                })
            let body = res.body;
            if (body.ok) {
                let results = body.result.filter((r) => { return r.message && r.message.text; });
                Promise.map(results, execute, { concurrency: handler.concurrency })
                offset = body.result[body.result.length - 1]['update_id'] + 1
                localStorage.setItem(`checkpoint:${handler.apiToken}`, offset);
            }
        } catch (e) {
            //TODO
        } finally {
            yield Promise.delay(5000);//TODO
        }

    }
});

// start();

