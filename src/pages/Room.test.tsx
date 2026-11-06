import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { Room } from "./Room";
import { useBooth } from "../stores/booth";
const mocks = vi.hoisted(() => ({
  userId: "guest",
  ids: ["host", "guest"],
  send: vi.fn(),
  compose: vi.fn(async (photos: string[]) => photos.join(":")),
  callbacks: null as null | {
    state: (s: string) => void;
    message: (member: string, m: Record<string, unknown>) => void;
    photo: (member: string, id: string, data: string) => void;
    error: (e: Error) => void;
    presence: (ids: string[]) => void;
    connection: (member: string, open: boolean) => void;
  },
  sendPhoto: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  stream: { getTracks: () => [], getVideoTracks: () => [{ enabled: true }] },
}));
vi.mock("../services/supabase/client", () => ({
  anonymousSession: async () => ({ user: { id: mocks.userId } }),
  rpc: async () => ({
    id: "test-room",
    name: "Our private booth",
    host_id: "host",
    expires_at: new Date(Date.now() + 1800000).toISOString(),
    closed: false,
    members: mocks.ids.map((id) => ({ user_id: id, nickname: id })),
  }),
}));
vi.mock("../features/camera/useCamera", () => ({
  useCamera: () => ({
    video: { current: null },
    stream: mocks.stream,
    error: "",
    busy: false,
    ready: true,
    start: vi.fn(),
    stop: mocks.stop,
    capture: () => "local-photo",
  }),
}));
vi.mock("../features/photostrip/group", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/photostrip/group")>()),
  composeGroup: mocks.compose,
}));
vi.mock("../services/webrtc/peer", () => ({
  BoothPeer: class {
    open = true;
    offset = () => 0;
    latency = 0;
    sendPhoto = mocks.sendPhoto;
    send = mocks.send;
    dispose = vi.fn();
    constructor(
      _room: unknown,
      _uid: unknown,
      _stream: unknown,
      callbacks: typeof mocks.callbacks,
    ) {
      mocks.callbacks = callbacks;
    }
    async connect() {
      mocks.callbacks!.presence(mocks.ids);
      for (const id of mocks.ids.filter((id) => id !== mocks.userId))
        mocks.callbacks!.connection(id, true);
      mocks.callbacks!.state("connected");
    }
  },
}));
describe("completed private room keepsake", () => {
  it("connects automatically and lets the host start only when all four guests are ready", async () => {
    mocks.userId = "host";
    mocks.ids = ["host", "guest", "second", "third", "fourth"];
    mocks.send.mockClear();
    try {
      render(
        <MemoryRouter initialEntries={["/room/test-room"]}>
          <Routes>
            <Route path="/room/:id" element={<Room />} />
          </Routes>
        </MemoryRouter>,
      );
      const readyButton = await screen.findByRole("button", {
        name: "I’m ready",
      });
      await waitFor(() => expect(readyButton).toBeEnabled());
      const startButton = screen.getByRole("button", {
        name: "Start shared countdown",
      });
      expect(startButton).toBeDisabled();
      fireEvent.click(readyButton);
      expect(
        screen.getByRole("button", { name: "Equal Five" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(mocks.send).toHaveBeenCalledWith(["guest"], {
        type: "ready",
        value: true,
      });
      expect(startButton).toBeDisabled();
      act(() => {
        for (const guest of ["guest", "second", "third"])
          mocks.callbacks!.message(guest, { type: "ready", value: true });
      });
      expect(startButton).toBeDisabled();
      act(() =>
        mocks.callbacks!.message("fourth", { type: "ready", value: true }),
      );
      expect(startButton).toBeEnabled();
      vi.useFakeTimers();
      fireEvent.click(startButton);
      const guests = mocks.ids.slice(1);
      const schedule = mocks.send.mock.calls.find(
        ([, message]) => message.type === "schedule",
      );
      expect(schedule?.[0]).toEqual(guests);
      const shotId = schedule?.[1].id;
      await act(async () => vi.advanceTimersByTimeAsync(3400));
      await act(async () => {
        for (const guest of guests.slice(0, 3))
          mocks.callbacks!.photo(guest, shotId, guest);
      });
      expect(mocks.compose).not.toHaveBeenCalled();
      await act(async () => mocks.callbacks!.photo("fourth", shotId, "fourth"));
      expect(mocks.compose).toHaveBeenCalledWith(
        ["local-photo", ...guests],
        "equal",
      );
      expect(mocks.sendPhoto).toHaveBeenCalledWith(
        guests,
        shotId,
        ["local-photo", ...guests].join(":"),
      );
    } finally {
      vi.useRealTimers();
      mocks.userId = "guest";
      mocks.ids = ["host", "guest"];
    }
  });

  it("waits for every group shot and preserves export access after the host leaves", async () => {
    render(
      <MemoryRouter initialEntries={["/room/test-room"]}>
        <Routes>
          <Route path="/room/:id" element={<Room />} />
          <Route path="/editor" element={<p>Editor opened</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Our private booth" });
    await screen.findByText("connected");
    fireEvent.click(screen.getByRole("button", { name: "I’m ready" }));
    act(() =>
      mocks.callbacks!.message("host", {
        type: "reset",
        run: "session",
        count: 2,
      }),
    );
    let acknowledgeLastPhoto!: () => void;
    mocks.sendPhoto
      .mockImplementationOnce(async () => {})
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            acknowledgeLastPhoto = resolve;
          }),
      );
    for (const id of ["shot-a", "shot-b"]) {
      act(() =>
        mocks.callbacks!.message("host", {
          type: "schedule",
          run: "session",
          id,
          at: Date.now() - 1,
          layout: "side",
        }),
      );
      await waitFor(() =>
        expect(mocks.sendPhoto).toHaveBeenCalledWith(
          ["host"],
          id,
          "local-photo",
        ),
      );
      await act(async () => mocks.callbacks!.photo("host", id, `group-${id}`));
    }
    act(() =>
      mocks.callbacks!.message("host", { type: "complete", run: "session" }),
    );
    await act(async () => acknowledgeLastPhoto());
    expect(screen.getByRole("button", { name: "You’re ready" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Make our keepsake" }),
    ).toBeVisible();
    act(() => {
      mocks.callbacks!.state("disconnected");
      mocks.callbacks!.error(new Error("Partner left the booth."));
    });
    fireEvent.click(screen.getByRole("button", { name: "Make our keepsake" }));
    expect(await screen.findByText("Editor opened")).toBeVisible();
    expect(useBooth.getState().photos).toEqual([
      "group-shot-a",
      "group-shot-b",
    ]);
    expect(mocks.stop).toHaveBeenCalled();
  });
});
