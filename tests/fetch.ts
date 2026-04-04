const options = {
  port: 18800,
}
const loginToken = "1234";
const baseUrl = `http://127.0.0.1:${options.port}`;
  //http://localhost:18800/api/auth/login
  const fetchlogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({token: loginToken}),
    //    "set-cookie": [ "picoclaw_launcher_auth=16aa5e8edbb59cd008fb82d6346d1117287d1842550dd8ac8d587201a276b572; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax" ],
  });
  const cookie = fetchlogin.headers.get("set-cookie");
  console.log(cookie, fetchlogin)
    //GET /api/pico/token HTTP/1.1
    //Host: localhost:18800
    //User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:148.0) Gecko/20100101 Firefox/148.0
    //Accept: */*
    //Accept-Language: es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7
    //Accept-Encoding: gzip, deflate, br, zstd
    //Sec-GPC: 1
    //Connection: keep-alive
    //Cookie: picoclaw_launcher_auth=16aa5e8edbb59cd008fb82d6346d1117287d1842550dd8ac8d587201a276b572
    //Sec-Fetch-Dest: empty
    //Sec-Fetch-Mode: cors
    //Sec-Fetch-Site: same-origin
    //Priority: u=4
    //Pragma: no-cache
  const fetchToken = await fetch(`${baseUrl}/api/pico/token`, {
    headers: { "Cookie": cookie ? cookie.split(';')[0] : ""} as Record<string, string>,
  });
  const jsondata = await fetchToken.json();
  console.log(jsondata)