# Build queue

Objects and sets a script needs that the 3D library does not have yet (content/ROUTINE.md step 6).
One line each: `- [ ] set|object NAME: what it must show (script ids that need it)`. Routines build these FIRST; tick and move to Done when merged.

## To build
- [ ] set rink: an ice hockey rink (white ice, red/blue lines, boards, goal net, stands) for "hockey"/"NHL"/"rink"/"Stanley Cup" lines (169 McDavid is a draft until this exists; it uses stage/throne now)
- [ ] object puck + hockeystick: a black puck and a plain hockey stick (169)
- [ ] object icepop: a popsicle on a stick (173 uses box + an ICE POPS card)
- [ ] object noodlecup: a foam cup of instant noodles with a peeled lid and steam (165 uses coffee)
- [ ] object legobrick: a chunky 2x4 toy brick with studs, bright colours, plain (no logo) (166 uses crate)
- [ ] object eiffeltower: a small Eiffel Tower model built from bricks (166 uses house)
- [x] set factory (Nov 21, things-test/20261121-p4sets): a factory floor (conveyor belts, robot arms, crates, big chimney windows) for "factory" lines (164)
- [x] set mountain (Nov 21, things-test/20261121-p4sets): a rocky mountain with a mine entrance, cart tracks and gold veins for "mountain"/"mine" lines (164)
- [ ] object giant shovel: a house-tall shovel (164 uses shovel + house)
- [ ] act guitar: review a "plays guitar" act (not in approved.json yet; object guitar is built) (162)
- [x] set gridiron + tennis (checked built in sets.ts Nov 21)


## Done
- [x] set pool (drained pool as a tennis court) + objects guitar, rollercoaster, tested on things-test/20261121-p3, stills checked, Nov 21 part 3
- [x] objects horse + baseball (and no basketball on diamond throw lines), tested on things-test/20261121-p2obj, Nov 21 part 2
- [x] act qb_throw fixed (ball clear of the face, panel after the catch) and approved, things-test/20261121-p2qb, Nov 21 part 2
- [x] act tennis_serve fixed (contact frame + ball over the net) and approved, things-test/20261121-p2acts, Nov 21 part 2
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
