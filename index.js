import fetch from 'node-fetch';
import { spawn } from 'child_process';
import fs from 'fs';
import crypto from 'crypto'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import path from 'path';
import PromptSync from 'prompt-sync';


const prompt = PromptSync();

puppeteer.use(StealthPlugin())

const LIMIT_REACHED = 1;

let USERS = [];
let USER = "none";

function read_user_config(user) {
  return JSON.parse(fs.readFileSync(`config/${user}`, { encoding: 'utf8' }).trim());
}

function write_user_config(user, field, data) {
  let c = {};
  if (fs.existsSync(`config/${user}`))
    c = read_user_config(user);
  c[field] = data;
  fs.writeFileSync(`config/${user}`, JSON.stringify(c));
}


async function login(email, pass) {
  let browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage()
  await page.goto('https://chat.openai.com/auth/login')
  await page.click("[data-testid='login-button']");
  let email_selector = "#username";
  let pass_selector = "#password";
  await page.waitForSelector(email_selector);
  await page.type(email_selector, email)
  await page.click("._button-login-id");
  await page.waitForSelector("._button-login-password");
  await page.type(pass_selector, pass)
  await page.waitForTimeout(500);
  for (let i = 0; i < 1000; i++) {
    try {
      await page.click("._button-login-password");
      break;
    } catch (e) {
    }
  }
  await page.waitForNavigation();
  const data = await page.evaluate(async () => {
    let res = await fetch("https://chat.openai.com/api/auth/session", {
      "headers": {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.8",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "sec-ch-ua": "\"Brave\";v=\"117\", \"Not;A=Brand\";v=\"8\", \"Chromium\";v=\"117\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Linux\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "sec-gpc": "1"
      },
      "referrer": "https://chat.openai.com/",
      "referrerPolicy": "same-origin",
      "body": null,
      "method": "GET",
      "mode": "cors",
      "credentials": "include"
    });
    let d = await res.text();
    return d;
  });
  let j = JSON.parse(data)
  await browser.close();
  return (j.accessToken);
}


function get_curl_cmd(url, data) {
  let bearer = read_user_config(USER).bearer;
  let cf_bm = read_user_config(USER).cf_bm;
  let r = `./curl-impersonate-chrome '${url}' \
  -H 'authority: chat.openai.com' \
  -H 'accept: application/json' \
  -H 'accept-language: en-US' \
  -H 'authorization: Bearer ${bearer}' \
  -H 'cache-control: no-cache' \
  -H 'content-type: application/json' \
  -H 'cookie: __cf_bm=${cf_bm}; ' \
  -H 'origin: https://chat.openai.com' \
  -H 'pragma: no-cache' \
  -H 'sec-ch-ua: "Brave";v="117", "Not;A=Brand";v="8", "Chromium";v="117"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "Linux"' \
  -H 'sec-fetch-dest: empty' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-site: same-origin' \
  -H 'sec-gpc: 1' \
  -H 'user-agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36' \ `;
  if (data) {
    r += `--data-raw '${JSON.stringify(data)}' \ `
  }
  r += ' --compressed'
  return r;
}

async function check_version(show) {

  return new Promise((resolve, reject) => {
    let curl = get_curl_cmd('https://chat.openai.com/backend-api/accounts/check/v4-2023-04-27') + ' -v';
    const subProcess = spawn("/bin/sh", ['-c', curl]);

    subProcess.stdout.on('data', (data) => {
      if (show)
        try {
          let dd = JSON.parse(data.toString().replace('data: ', ''));
          console.log(JSON.stringify(dd, null, 2))
        } catch (e) {
          console.error(e)
        }
    });
    subProcess.stderr.on('data', (data) => {
      data = data.toString();
      if (data.toLowerCase().includes('set-cookie')) {
        let m = (data.toString()).match((/set-cookie: (.*?);/g))
        // console.log(m)
        for (let mm of m) {
          if (mm.includes('cf_bm')) {
            let c = ((/set-cookie: __cf_bm=(.*?);/g)).exec(mm)[1];
            write_user_config(USER, 'cf_bm', c);
            console.log('[-] Cookies updated');
          }
        }
      }
    });
    subProcess.on('error', (error) => {
    });
    subProcess.on('close', (code) => {
      resolve(code);
    });
  })
}

async function chat_prompt(query) {

  return new Promise((resolve, reject) => {
    let data = {
      "action": "next",
      "messages": [{
        "id": read_user_config(USER).message_id,
        "author": {
          "role": "user"
        },
        "content": {
          "content_type": "text",
          "parts": [query]
        },
        "metadata": {}
      }],
      "parent_message_id": read_user_config(USER).parent_id,
      "model": "text-davinci-002-render-sha",
      "timezone_offset_min": -60,
      "suggestions": [],
      "history_and_training_disabled": false,
      "arkose_token": null,
      "conversation_mode": {
        "kind": "primary_assistant"
      },
      "force_paragen": false,
      "force_rate_limit": false
    };
    let conv_id = read_user_config(USER).conv_id;
    if (conv_id != '') {
      data["conversation_id"] = conv_id;
    }
    let curl = get_curl_cmd('https://chat.openai.com/backend-api/conversation', data);
    const subProcess = spawn("/bin/sh", ['-c', curl]);

    let first_msg = true;

    subProcess.stdout.on('data', (data) => {
      try {
        let d = (data.toString()).split('\n');
        for (let e of d) {
          if (e != "") {
            try {
              if (e == "data: [DONE]") {
                continue;
              }
              let dd = JSON.parse(e.replace('data: ', ''));
              let s = "";
              if (dd?.message?.content?.parts === undefined) {
                if (dd.detail) {
                  console.log(dd.detail)
                  subProcess.kill();
                  resolve(LIMIT_REACHED);
                  return;
                }
                if (first_msg) {
                  first_msg = false;
                  write_user_config(USER, 'message_id', crypto.randomUUID());
                } else {
                  write_user_config(USER, 'parent_id', dd.message_id);
                  write_user_config(USER, 'conv_id', dd.conversation_id);
                }
                continue;
              }
              for (let ss of dd?.message?.content?.parts)
                s += ss;
              if (s) {
                console.clear()
                console.log(s)
              }
            } catch (err) {
            }
          }
        }
      } catch (e) {
        console.error(e)
      }
    });
    subProcess.stderr.on('data', (data) => {
      data = data.toString();
      if (data.toLowerCase().includes('set-cookie')) {
        let m = (data.toString()).match((/set-cookie: (.*?);/g))
        console.log(m)
      }
    });
    subProcess.on('close', (data) => {
      resolve(2);
    })
  })
}

async function update_session(user, pass) {
  let data = read_user_config(user);
  let token = await login(data.email, pass);
  console.log(`[-] Login ...`);
  write_user_config(user, 'bearer', token);
  console.log(`[-] Login done ${data.email}`);
}

function load_users() {
  if (!fs.existsSync('config'))
    fs.mkdirSync('config')
  let files = fs.readdirSync('config')
  let users = [];
  for (let file of files) {
    let d = fs.readFileSync(path.join('config', file));
    try {
      let j = JSON.parse(d);
      if (j.bearer != "")
        users.push(file);

    } catch (e) {
    }
  }
  return users;
}

async function main() {
  USERS = load_users();
  if (process.argv.includes("--show-users")) {
    console.log(`[-] Users found : ${USERS.toString()}`)
    return;
  }
  if (process.argv.includes("--login")) {
    let email = prompt('[?] Email: ');
    let pass = prompt('[?] Password: ', { echo: '*' });
    let user = email.split("@")[0];
    write_user_config(user, 'email', email);
    write_user_config(user, 'message_id', crypto.randomUUID());
    write_user_config(user, 'parent_id', '');
    write_user_config(user, 'conv_id', '');
    await update_session(user, pass);
    return;
  }
  if (USERS.length == 0) {
    console.log(`[x] No accounts found ... please login using '--login'`);
    return;
  }
  let query = "";
  do {
    query = process.argv[2] || "";
    if (!query)
      query = prompt('[?] Query: ');
    if (query.length == 0)
      return;
    for (let i = 0; i < USERS.length; i++) {
      USER = USERS[i];
      try {
        let r = await chat_prompt(query)
        if (r == LIMIT_REACHED) {
          console.log(`[x] Limit reached per ${USER} ... switching account`);
        } else {
          break;
        }
      } catch (e) {
      }
    }
    console.log("\n")
  } while (query != "");
}

main();
