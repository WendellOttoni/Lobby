import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";

export default function LazyEmojiPicker({
  onPick,
}: {
  onPick: (emoji: string) => void;
}) {
  return (
    <EmojiPicker
      theme={Theme.DARK}
      emojiStyle={EmojiStyle.NATIVE}
      lazyLoadEmojis
      skinTonesDisabled
      searchPlaceholder="Buscar emoji..."
      width="100%"
      height={340}
      onEmojiClick={(data) => onPick(data.emoji)}
    />
  );
}
