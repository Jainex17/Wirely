import { describe, expect, it } from "bun:test";
import { setCameraMoving, whenCameraRests } from "@/lib/cameraMotion";

describe("whenCameraRests", () => {
  it("holds work while the camera moves and lets it run once it rests", async () => {
    const ran: string[] = [];
    await whenCameraRests().then(() => ran.push("at rest"));
    setCameraMoving(true);
    const held = whenCameraRests().then(() => ran.push("after the gesture"));
    await Promise.resolve();
    expect(ran).toEqual(["at rest"]);
    setCameraMoving(false);
    await held;
    expect(ran).toEqual(["at rest", "after the gesture"]);
  });
});
