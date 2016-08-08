
//webtorrent
var client = new WebTorrent();
//firebase
firebase.initializeApp({
    apiKey: "AIzaSyAFlH1OEvxWRGSwzYSEj8VL4oLqLPQtQtU",
    authDomain: "groovetorrent-a937a.firebaseapp.com",
    databaseURL: "https://groovetorrent-a937a.firebaseio.com",
    storageBucket: "groovetorrent-a937a.appspot.com",
});
var songsRef = firebase.database().ref("rooms/demo/songs");


var vue = new Vue({
    el: '#app',
    data: {
        songs: [],
        currentSong: null
    },
    methods: {
        onFileSelect: function (file) {
            var self = this;
            var p = client.seed(file, function (torrent) {
                var song = {
                    name: file.name,
                    torrent: torrent,
                    link: torrent.magnetURI,
                    state: "seeding",
                    download: "0",
                    upload: "0",
                    percentage: "0",
                    peers: "0"
                }
                self.songs.push(song);
                songsRef.push({
                    name: song.name,
                    link: song.link
                })
            })
        },
        play: function (song) {
            var self = this;
            if (this.currentSong && this.currentSong.url) {
                URL.revokeObjectURL(this.currentSong.url);
            }
            song.torrent.files[0].getBlobURL(function (err, url) {
                song.url = url;
                self.currentSong = song;
            })
        },
        sync: function (newMeta) {
            var self = this;
            var meta = newMeta;
            var dul = self.songs.filter(function (song) { return song.link === meta.link });
            if (dul.length > 0) {
                return;
            }
            var song = {
                name: meta.name,
                link: meta.link,
                state: "init",
                download: "0",
                upload: "0",
                percentage: "0",
                peers: "0"
            }
            self.songs.push(song);
            client.add(meta.link, function (torrent) {
                var file = torrent.files[0]
                song.torrent = torrent;
                song.state = "syncing";
                torrent.on('done', function () {
                    song.state = "seeding"
                })
            });
        }
    },
    ready: function () {
        var self = this;
        setInterval(function () {
            self.songs.forEach(function (song) {
                if (song.torrent) {
                    song.download = prettyBytes(song.torrent.downloadSpeed);
                    song.upload = prettyBytes(song.torrent.uploadSpeed);
                    song.percentage = Math.round(song.torrent.progress * 100 * 100) / 100;
                    song.peers = song.torrent.numPeers;
                }
            });
        }, 2000);

        songsRef.on('child_added', function (data) {
            self.sync(data.val());
        });

    }
})



function prettyBytes(num) {
    var exponent, unit, neg = num < 0, units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    if (neg) num = -num
    if (num < 1) return (neg ? '-' : '') + num + ' B'
    exponent = Math.min(Math.floor(Math.log(num) / Math.log(1000)), units.length - 1)
    num = Number((num / Math.pow(1000, exponent)).toFixed(2))
    unit = units[exponent]
    return (neg ? '-' : '') + num + ' ' + unit
}




