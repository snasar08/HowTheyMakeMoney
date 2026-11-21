# Build queue

Objects and sets a script needs that the 3D library does not have yet (content/ROUTINE.md step 6).
One line each: `- [ ] set|object NAME: what it must show (script ids that need it)`. Routines build these FIRST; tick and move to Done when merged.

## To build
- [ ] set golf: golf course (fairway, green with flag + hole, bunker, tee box, golf cart); words golf/Masters/putt/fairway pick it (135)
- [ ] act review golf_swing, race_car, tennis_serve, qb_throw, touchdown: built but NOT in acts/approved.json, so they never fire; test each on things-test and approve those that pass the SPEC bar (135, 136, 137, 138)
- [x] set gridiron + tennis (checked built in sets.ts Nov 21)

## Done
- [x] objects console (box + controller), golfball (on a tee), golfclub (driver), tested on things-test/20261121-p1, Nov 21
- [x] set gym (weights rack, bench press, mats, mirrors, kettlebells, treadmill; lift_weights act allows it), Nov 18
- [x] set studio (1920s animation studio: light-board desks, pinned sketches, film camera on tripod, reels, warm lamps), Nov 18
- [x] set farm (barn, silo, ploughed rows, fence, dirt road, hay), Nov 18
- [x] set store (grocery store: aisles, fruit stand, checkout conveyor, bags), Nov 18
- [x] set diamond (baseball field), Nov 18
- [x] objects soccerball, chatbot, glasses, dumbbell, hanger, dome, Nov 18
- [x] object fort_fence: every library model (index*.json) is now drawable from `things` (toon.AH_ALL_THINGS), Nov 18
