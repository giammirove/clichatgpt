### Disclaimer
The software hasn't been tested, and I can't ensure its functionality.
I aimed to keep this project as simple as possible.
Please use it responsibly and refrain from utilizing it for malicious purposes.

### Things you can do:
- Chat with ChatGPT
- That's all folks

### What you need:
- Free account OpenAI (not created through Google)

### What you do not need:
- API KEY

### How to use it:
- to setup: `npm i` 
- to login: `node index.js --login`
- to show users: `node index.js --show-users`
- to chat: `node index.js`

### Good to know:
- This script uses [curl-impersonate](https://github.com/lwthiker/curl-impersonate), so if it does not work
try to download another version of `curl-impersonate-chrome` from [here](https://github.com/lwthiker/curl-impersonate/releases)

**Note**: if you have multiple users, the program will try to use them one after another,
in the case you reached the limit on one account, it will just continue with next
one
