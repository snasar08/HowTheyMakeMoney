# Build queue

Objects and sets a script needs that the 3D library does not have yet (content/ROUTINE.md step 6).
One line each: `- [ ] set|object NAME: what it must show (script ids that need it)`. Routines build these FIRST; tick and move to Done when merged.

## To build
- [ ] act fix qb_throw (COMPLETE! panel hides the QB mid-throw) + tennis_serve (show racket-ball contact and the ball crossing the net), then re-test on things-test and approve (137, 138). See acts/approved.json off_until_fixed
- [x] set gridiron + tennis (checked built in sets.ts Nov 21)

- [ ] object horse: a chunky cel-shaded racehorse (brown, mane, saddle), for horse-racing lines (147 farm scene: swap into its `things`)

## Done
- [x] acts race_car + touchdown reviewed and approved (things-test/20261121-acts), Nov 21
- [x] set golf (fairway, green + flag, bunkers, tee box, cart) + golf_swing act approved, tested on things-test/20261121-golf, Nov 21
- [x] objects console (box + controller), golfball (on a tee), golfclub (driver), tested on things-test/20261121-p1, Nov 21
- [x] set gym (weights rack, bench press, mats, mirrors, kettlebells, treadmill; lift_weights act allows it), Nov 18
- [x] set studio (1920s animation studio: light-board desks, pinned sketches, film camera on tripod, reels, warm lamps), Nov 18
- [x] set farm (barn, silo, ploughed rows, fence, dirt road, hay), Nov 18
- [x] set store (grocery store: aisles, fruit stand, checkout conveyor, bags), Nov 18
- [x] set diamond (baseball field), Nov 18
- [x] objects soccerball, chatbot, glasses, dumbbell, hanger, dome, Nov 18
- [x] object fort_fence: every library model (index*.json) is now drawable from `things` (toon.AH_ALL_THINGS), Nov 18
