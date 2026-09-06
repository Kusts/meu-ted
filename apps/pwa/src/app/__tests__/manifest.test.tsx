import manifest from "@/app/manifest";

type CaptureManifest = ReturnType<typeof manifest> & {
  share_target?: {
    action?: string;
    method?: string;
    enctype?: string;
    params?: Record<string, string>;
  };
  shortcuts?: Array<{ name?: string; url?: string }>;
};

describe("capture manifest", () => {
  it("declares the share target contract", () => {
    const result = manifest() as CaptureManifest;

    expect(result.share_target).toEqual({
      action: "/capture",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: {
        title: "title",
        text: "text",
        url: "url",
      },
    });
  });

  it("declares the new-expense shortcut", () => {
    const result = manifest() as CaptureManifest;

    expect(result.shortcuts).toContainEqual({
      name: "Novo gasto no Meu Ted",
      url: "/capture?kind=expense",
    });
  });
});
