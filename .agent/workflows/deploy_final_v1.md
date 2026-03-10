---
description: Deploy the application to GitHub and update Firebase/Google Cloud Functions
---

1. Add all changes to git
   > git add .

2. Commit changes with the specified message
   > git commit -m "Final v1"

3. Push changes to the main branch
   > git push origin main

4. Deploy functions to Firebase
   > firebase deploy --only functions
