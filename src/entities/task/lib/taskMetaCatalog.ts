export type TaskMetaOption = { value: string; label: string }

// IMPORTANT: These are the "allowed" choices shown to customers when posting a task.
// Executor filters should be based on this catalog (not on currently published tasks).
export const TASK_PLATFORM_OPTIONS: TaskMetaOption[] = [
  { value: 'TikTok', label: 'TikTok' },
  { value: 'Instagram Reels', label: 'Instagram Reels' },
  { value: 'YouTube Shorts', label: 'YouTube Shorts' },
  { value: 'VK Клипы', label: 'VK Клипы' },
  { value: 'Telegram', label: 'Telegram' },
  { value: 'MAX', label: 'MAX' },
  { value: 'Яндекс Дзен', label: 'Яндекс Дзен' },
  { value: 'Wibes', label: 'Wibes' },
  { value: 'Snapchat Spotlight', label: 'Snapchat Spotlight' },
  { value: 'Facebook Reels', label: 'Facebook Reels' },
]

export const TASK_FORMAT_OPTIONS: TaskMetaOption[] = [
  { value: '9:16', label: '9:16 (вертикальное)' },
  { value: '1:1', label: '1:1 (квадрат)' },
  { value: '16:9', label: '16:9 (горизонтальное)' },
  { value: 'Talking head', label: 'Talking head' },
  { value: 'UGC', label: 'UGC' },
  { value: 'Motion graphics', label: 'Motion graphics' },
  { value: 'Screen recording', label: 'Screen recording' },
  { value: 'Voiceover', label: 'Voiceover' },
  { value: 'Subtitles', label: 'С субтитрами' },
  { value: 'Tutorial', label: 'Туториал / how-to' },
  { value: 'Review', label: 'Обзор / review' },
]

