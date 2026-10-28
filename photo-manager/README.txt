BREAKFAST CLUB PHOTO MANAGER (runs on your Windows PC with Docker Desktop)
=========================================================================

FIRST TIME
1. Unzip this folder somewhere it can stay, for example Documents\breakfast-club-photos.
2. Open Docker Desktop and wait until it says it is running.
3. Double-click "Start Photo Manager.bat".
   The first start takes a few minutes while Docker builds it. After that it starts in seconds.
   Your browser opens http://localhost:8787 (open that address yourself if it doesn't).

ADDING PICTURES, GIFS AND VIDEOS
- Pick the game tab (Dungeon Dwellers, Breakfast Club, Loot & Ledger).
- Drop in as many files as you like. Each one gets a spot box. Names that match a spot are
  filled in for you, otherwise type a few letters and pick from the list. No renaming needed.
- Click "Save all to the library". Every spot also has Add / Replace / Remove in the grid below.
- Click any box to see everything about that spot: the full name, what it is and where it shows
  up (how to get each ending and what happens in it, recipe ingredients and steps, delver stories,
  item lore...), plus a link that searches the web for matching pictures or sounds.
  The search box looks through those descriptions too (try "resurrected" or "chickpeas").
- Videos only go in the Cutscene spots. Use MP4 (H.264). Most phone and PC videos already are.
- Sounds and music work the same way: drop MP3, M4A, WAV or OGG files in, or use the sound spots.
- Adding NEW things (not just filling a spot): every group you can add to has a "+ New ..." tile.
  Click it, type a name, choose the picture or sound and fill in the details:
    Breakfast Club:
      companions, pet accessories (price, unlock level), pet toys (how it moves, price, level),
      backgrounds to choose from, whole new recipes (category, calories, macros, ingredients, steps),
      sounds (tap/click, done/alert, pet sound for every pet or for one pet by name),
      pet room furniture / wall art / pet stuff (what your pet does with it, framed or not, price),
      pet room wallpapers and floors (stretched or repeating), pet beds,
      progress photos (pose and date), pictures for your own exercises and recipes
    Loot & Ledger:    custom bosses (HP, damage, size) and the Crypt Keeper's size
    Dungeon Dwellers: cutscenes, music (menu, in-game, outro, calm and intense stems for explore,
                      combat, camp and boss), the walking / cave background, new enemies, new bosses,
                      new random room backgrounds, loot and treasure pictures, traps, new photo spots
    Color Art:        photos to turn into coloring pages (Paint your photo > From your PC)
  Change the details later with "Details" on the item. Phones pick up changes at the next sync.
- On the phone, PC backgrounds show up in Breakfast Club > Settings > Appearance under
  "Backgrounds from your PC". Tap one to use it. Picking your own background again overrides it.
- Pet room items show up in the room's Decorate menu; wallpapers and floors under Walls & floor.
- Everything is kept in the "library" folder next to this file. Back that folder up.

GETTING THEM ONTO THE PHONES (both phones, any time the PC is on)
- In Breakfast Club: Settings > Data & Sync > "Photos & videos from your PC" > Sync from my PC.
  (The same card is in Dungeon Dwellers settings and Photo Studio, Loot & Ledger settings and
  Color Art's Paint your photo. One sync covers every app.)
- The first time, tap "Paste PC link" and paste the Phone link shown in the manager.
  To skip that forever: open "Auto-find on phones" in the manager and enter the same Supabase
  URL, key and household code you use for Breakfast Club sync. Then phones find the PC by
  themselves, even after the link changes.
- When the PC is off: click "Download bundle" in the manager, send the .bcpack file to the
  phone (USB, Quick Share or Drive), then tap "Import bundle file" on the phone.
- The files are saved inside the app, not in the gallery, and keep working with the PC off.
- Pictures you add on the phone itself (recipe and exercise pictures, your own companions, pet
  accessories and toys) go up to the PC library by themselves when the app opens and after each
  sync. The PC only ADDS them: a spot that already has a picture is never replaced. There is also
  a "Send my phone's own pictures to the PC" button in the same card. They show up in the manager
  like any other picture, so they end up in your PC backup too.
- If you remove something in the manager, the phones drop it at their next sync.

DUNGEON DWELLERS VOICES (PIPER)
- In the game: Settings > Audio > Piper voices > tick "Use Piper voices". Piper itself (about
  45 MB) and the voice file (about 75 MB) come from your PC with the next sync, or download once
  if the PC hasn't sent them yet. They are not part of the website, so the Netlify upload stays small.
  After that it works with no internet. Every character gets a voice of their own; change any of
  them under "Voices for each character" (tap the play button to listen, the dice to try another).
- Your PC records lines too: the phones send every new line they speak to the Photo Manager, which
  records it with Piper in the background (see the "Dungeon Dwellers voices" card). "Send every
  line to my PC" in the game sends the whole script at once. After the next sync those lines play
  instantly from the recording, so the phone does less work.
- If a line isn't ready in time, the phone's own voice says it, so the narrator never goes quiet.
- The voices card on the PC has "Listen on this PC": type any line and a speaker number to hear it.

STOPPING
- Double-click "Stop Photo Manager.bat", or just shut the PC down. It starts again by itself
  with Docker Desktop.

DUNGEON DWELLERS CUTSCENE SPOTS (video, GIF or picture)
  Cutscene: Intro            Cutscene: Act I ... Cutscene: Act V
  Cutscene: Chapter I ... Cutscene: Chapter XI   (one per Chronicle chapter, from The Ledger to The Door of Hands)
  Cutscene: Death            Cutscene: Final Gate   Cutscene: Hollow King
  One for each of the 56 Story Weaver saga endings (Saga ending: Dawnbringer (The Lantern Pilgrim) ...)
  One for each of the 22 endings, for example:
    Ending: The Last Light, Ending: Wren Comes Home, Ending: The Forge Relit, Ending: The Ledger Burns,
    Ending: The Company Of The Deep, Ending: Strangers At The Gate, Ending: A Funeral In Daylight,
    Ending: The One They Feared ... (the manager lists them all)
OTHER NEW PICTURE SPOTS FROM THE LATEST GAME UPDATE
  Wren, Collector Harrow, Gray Hand Tallyman, the 24 Death Cards (Death Card: Ashes ...),
  Hidden Sigil, Mat: Seasoned Wood, Mat: Cloth Scraps
Cutscenes can be set in the in-game Photo Studio too, and switched off in the game settings (Data tab).


NEW IN THIS VERSION
- Thumbnails: the library grid loads small previews, so big libraries open fast.
- Whole folders: drop a folder on the box (or "Choose a whole folder"). Every picture, video and sound
  inside is matched to a spot by its name and its folder name. The Bulk helper lets you find/replace words
  in the names, re-match everything, or turn unmatched files into new items of one kind.
- Picture editor: open a spot, then "Crop / resize / background". Drag to crop, set a width to resize,
  remove a background automatically or tap a colour to remove. Saving keeps the spot's details.
- Search looks in the details too (lore, recipes, notes) and lists matches from the other games.
- Dungeon Dwellers: new enemies and bosses have Lore, Where it lurks, Weakness and a taunt. They show in
  the click-through details here.
- Arcade tab: your own sound for every Arcade effect, music for the game picker and each game, pictures for
  the game cabinets, and skins (with an optional price in club points).
- Duplicate finder: finds the exact same picture saved twice and pictures that look almost identical.
- Library backup: pick off / daily / weekly. Backups go to the "backups" folder next to this file. You can
  download one or restore it (restoring only adds back; it never deletes).
- Cloud copy (optional, needs the Supabase box filled in): keeps a copy online so phones can sync even when
  this PC is off. Files over 45 MB stay on the PC only. The PC library is always the master copy.
- Phones card: how many phones are connected and syncing right now.
- Interrupted phone downloads carry on where they stopped instead of starting over.

TRAY HELPER (optional, Windows)
Double-click "Start Tray Helper.bat". A small icon appears by the clock showing how many phones are
connected. Right-click it to open the manager, copy the phone link or start a backup. To have it start with
Windows, press Win+R, type shell:startup, and put a shortcut to "Start Tray Helper.bat" in that folder.

UPDATING FROM AN OLDER VERSION
Unzip over the old folder (keep the "library" folder), then double-click "Start Photo Manager.bat" again so
Docker rebuilds.
