# Regenerate with: vhs docs/demo.tape   (https://github.com/charmbracelet/vhs)
Output docs/demo.gif

Require npx

Set Shell "bash"
Set FontSize 15
Set Width 1280
Set Height 900
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set WindowBar Colorful

Hide
Type "export PS1='$ ' && clear" Enter
Show

Type "# Black Friday traffic. 10 orders. Client that 'just retries'." Enter
Sleep 600ms
Type "APP=naive-retry npx playwright test -g loyal --project black-friday --trace off" Enter
Sleep 3s
# skip the ~20s of real chaos-induced waiting
Hide
Wait+Screen@90s /resilience score/
Show
Sleep 7s

Type "clear" Enter
Type "# Same test. Resilient client: timeout + backoff + idempotency key." Enter
Sleep 600ms
Type "npx playwright test -g loyal --project bad-wifi --project subway --project black-friday" Enter
Sleep 3s
Hide
Wait+Screen@90s /resilience score/
Show
Sleep 6s
