# Notes for Claude

This repo is **public**, and GitHub Pages serves every file in it at edwardsapps.co.uk. Never commit anything private here: no knowledge base, client details, keys, screenshots of real customer data, or notes about security weaknesses in the apps.

How to work on the site (checks to run before pushing, guide PDFs, social images) is in `README.md`. Work on a branch and merge through a pull request; `main` is the live site.

**Don't run `scripts/update_site_shell.py`** until its footer template carries the company disclosures added on 19 Sep 2026. As of 4 Oct 2026 it would strip the KAE Limited details, the Terms link and the phone number from every page, and `check_site.py` wouldn't notice.

## Keep the EdwardsApps knowledge base current

Peter's Claude Project "EdwardsApps" relies on a knowledge file whose master is in his OneDrive: `Apps/EdwardsApps/EdwardsApps - Claude Project Knowledge.md`, alongside `EdwardsApps - Claude Project Instructions.md`.

When a session changes how the site or any EdwardsApps app is set up (pages, prices, domains, analytics or consent, store status, repos, how something is deployed), update the matching section of that file in the same session, change its "Last updated" line, and tell Peter to re-upload it to the Project.

- On Peter's PC the file is at `C:/Users/Peter/OneDrive - Edwards Surfacing/Apps/EdwardsApps/`: edit it there.
- In a cloud session the Microsoft 365 connector can read the master but not write it: read it, make the change, and send Peter the updated file to save over the master.

The knowledge file is private. It never goes in this repo.
