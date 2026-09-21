Il2Cpp.perform(function () {
    try {
        var img = Il2Cpp.domain.assembly("Gorimon.Core").image;
        img.class("Gorimon.Networking.API.CertificatePinningHandler").method("ValidateCertificate").implementation = function () { return true; };
    } catch (_) {}

    var asmNames = ["UnityEngine.UnityWebRequestModule", "UnityEngine.CoreModule"];
    for (var ai = 0; ai < asmNames.length; ai++) {
        try {
            var asm = Il2Cpp.domain.assembly(asmNames[ai]);
            if (!asm) continue;
            var uwr = null;
            try { uwr = asm.image.class("UnityWebRequest"); } catch (_) {}
            if (!uwr) try { uwr = asm.image.class("UnityEngine.Networking.UnityWebRequest"); } catch (_) {}
            if (!uwr) continue;
            var ms = uwr.methods;
            for (var mi = 0; mi < ms.length; mi++) {
                (function (m) {
                    var mn = m.name.toString();
                    if (mn === "set_url") {
                        m.implementation = function () {
                            var raw = arguments[0];
                            var url = raw.toString().replace(/^"/, "").replace(/"$/, "");
                            if (url.indexOf("hero-api.sigmonvr.com/auth") !== -1) {
                                url = url.replace("hero-api.sigmonvr.com", "outerspace.lightband.cn/api/gorimon-test/v3");
                            }
                            url = url.replace(/playerId=1060/g, "playerId=349711");
                            return this.method("set_url").invoke(Il2Cpp.string(url));
                        };
                    }
                    if (mn === "SendWebRequest") {
                        m.implementation = function () {
                            try {
                                var url = this.method("get_url").invoke().toString().replace(/^"/, "").replace(/"$/, "");
                                console.log("[GORIMON] >>> " + url);
                                if (url.indexOf("hero-api.sigmonvr.com/auth") !== -1) {
                                    var newUrl = url.replace("hero-api.sigmonvr.com", "outerspace.lightband.cn/api/gorimon-test/v3");
                                    this.method("set_url").invoke(Il2Cpp.string(newUrl));
                                    console.log("[GORIMON] REDIRECTED >>> " + newUrl);
                                }
                            } catch (_) {}
                            return this.method("SendWebRequest").invoke.apply(this, arguments);
                        };
                    }
                    if (mn === "get_downloadHandler") {
                        m.implementation = function () {
                            var handler = this.method("get_downloadHandler").invoke.apply(this, arguments);
                            try {
                                var url = this.method("get_url").invoke().toString().replace(/^"/, "").replace(/"$/, "");
                                if (url.indexOf("/auth") !== -1 && handler && !handler.handle.isNull()) {
                                    var text = handler.method("get_text").invoke();
                                    if (text) {
                                        var str = text.toString().replace(/^"/, "").replace(/"$/, "");
                                        if (str.indexOf("playerId") !== -1) {
                                            var patched = str.replace(/"playerId"\s*:\s*\d+/, '"playerId":349711');
                                            if (patched !== str) {
                                                console.log("[GORIMON] ID SPOOFED to 349711");
                                                handler.method("set_text").invoke(Il2Cpp.string(patched));
                                            }
                                        }
                                    }
                                }
                            } catch (_) {}
                            return handler;
                        };
                    }
                })(ms[mi]);
            }
            break;
        } catch (_) {}
    }
});
