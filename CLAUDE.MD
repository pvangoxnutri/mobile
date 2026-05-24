# CLAUDE.md

## Tillstånd

Pontus ger Claude fullt mandat att utföra kod- och konfigurationsändringar utan att be om bekräftelse, inklusive:

- Redigera, skapa och ta bort filer
- Stage:a och committa till git
- Pusha till remote (`origin`) på feature-branches och `master`
- Köra tester, type-checks, builds och linters
- Starta dev-servrar och bakgrundsprocesser
- Installera npm-/expo-paket när uppgiften kräver det
- Köra `eas update` på `preview`-kanalen

Detta gäller alla tre repos: `pvangoxnutri/website`, `pvangoxnutri/mobile`, `pvangoxnutri/backend`.

## Bekräfta först innan

Trots fullt mandat, fråga alltid innan följande:

- Destruktiva git-operationer (`reset --hard`, `branch -D`, `clean -f`)
- Force push (`push --force`, `push --force-with-lease`)
- Hoppa över hooks (`--no-verify`, `--no-gpg-sign`)
- Produktions-deploys (`eas build --profile production`, `eas submit`, Railway prod redeploy, Vercel prod deploy)
- Skicka publika meddelanden (kommentera/öppna/stänga GitHub-issues eller PR:er)
- Drop, truncate eller bulk-delete på Supabase-tabeller
- Radera EAS-builds, EAS-releases eller App Store-versioner
- Rotera nycklar eller ändra Railway/Vercel/EAS environment-secrets

## Kommunikationsstil

- Svara på svenska om Pontus skriver på svenska
- Korta, direkta svar
- Visa alltid `git diff --stat` innan commit
- Visa commit-meddelande innan push
