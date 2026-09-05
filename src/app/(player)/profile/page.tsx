import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AvatarUploadForm,
  DeletionForm,
  ProfileForm,
  SettingsForm,
} from "@/modules/player/profile-forms";
import {
  logoutAction,
  requestDeletionAction,
  updateProfileAction,
  updateSettingsAction,
  uploadAvatarAction,
} from "@/modules/player/actions";
import { Button } from "@/components/ui/button";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: settings }, { data: contacts }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("player_settings")
        .select("*")
        .eq("player_id", user.id)
        .maybeSingle(),
      supabase
        .from("player_contacts")
        .select("is_verified")
        .eq("player_id", user.id),
    ]);

  if (!profile) {
    redirect("/register");
  }

  const verified = Boolean(contacts?.some((row) => row.is_verified));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--brand-muted)]">
            <Link href="/home" className="underline-offset-4 hover:underline">
              ← Home
            </Link>
          </p>
          <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
            Profile & settings
          </h1>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">Profile</h2>
        <p className="text-sm text-[var(--brand-muted)]">
          Status: {profile.status}
          {verified ? " · verified" : " · verification required"}
        </p>
        <ProfileForm
          action={updateProfileAction}
          nickname={profile.nickname}
          avatarPresetId={profile.avatar_preset}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">Avatar upload</h2>
        <AvatarUploadForm action={uploadAvatarAction} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">Preferences</h2>
        <SettingsForm
          action={updateSettingsAction}
          defaults={{
            language: settings?.language ?? "lo",
            soundPack: settings?.sound_pack ?? "classic_casino",
            soundVolume: Number(settings?.sound_volume ?? 80),
            graphicsMode: settings?.graphics_mode ?? "auto",
            graphicsQuality: settings?.graphics_quality ?? "medium",
            fpsCap: settings?.fps_cap ?? 60,
            shadowsEnabled: settings?.shadows_enabled ?? true,
            effectsEnabled: settings?.effects_enabled ?? true,
            reduceMotion: settings?.reduce_motion ?? false,
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium text-red-300">Danger zone</h2>
        <DeletionForm action={requestDeletionAction} />
      </section>
    </main>
  );
}
