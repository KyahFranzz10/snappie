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
  send: vi.fn(),
  callbacks: null as null | {
    state: (s: string) => void;
    message: (m: Record<string, unknown>) => void;
    photo: (id: string, data: string) => void;
    error: (e: Error) => void;
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
    members: [
      { user_id: "host", nickname: "Host" },
      { user_id: "guest", nickname: "Guest" },
    ],
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
vi.mock("../features/photostrip/compose", () => ({
  pairPhotos: async (a: string, b: string) => `paired:${a}:${b}`,
}));
vi.mock("../services/webrtc/peer", () => ({
  BoothPeer: class {
    open = true;
    remoteOffset = 0;
    latency = 0;
    sendPhoto = mocks.sendPhoto;
    send = mocks.send;
    dispose = vi.fn();
    constructor(
      _room: unknown,
      _uid: unknown,
      _partner: unknown,
      _stream: unknown,
      callbacks: typeof mocks.callbacks,
    ) {
      mocks.callbacks = callbacks;
    }
    async connect() {
      mocks.callbacks!.state("connected");
    }
  },
}));
describe("completed private room keepsake", () => {
  it("connects automatically and lets the host start once both people are ready", async () => {
    mocks.userId = "host";
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
      expect(mocks.send).toHaveBeenCalledWith({ type: "ready", value: true });
      expect(startButton).toBeDisabled();
      act(() => mocks.callbacks!.message({ type: "ready", value: true }));
      expect(startButton).toBeEnabled();
      fireEvent.click(startButton);
      expect(mocks.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "schedule" }),
      );
    } finally {
      mocks.userId = "guest";
    }
  });

  it("waits for every pair and preserves export access after the partner leaves", async () => {
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
    act(() => mocks.callbacks!.message({ type: "reset", count: 2 }));
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
        mocks.callbacks!.message({
          type: "schedule",
          id,
          at: Date.now() - 1,
          layout: "side",
        }),
      );
      await waitFor(() =>
        expect(mocks.sendPhoto).toHaveBeenCalledWith(id, "local-photo"),
      );
      await act(async () => mocks.callbacks!.photo(id, `remote-${id}`));
    }
    act(() => mocks.callbacks!.message({ type: "complete" }));
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
      "paired:remote-shot-a:local-photo",
      "paired:remote-shot-b:local-photo",
    ]);
    expect(mocks.stop).toHaveBeenCalled();
  });
});
