import type { Embed } from '../../../../../shared/types';

interface Props {
  embed: Embed;
}

export default function LinkEmbed({ embed }: Props) {
  return (
    <a
      href={embed.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 block max-w-[520px] overflow-hidden rounded border-l-4 border-accent bg-ec-bg-secondary p-3 hover:bg-ec-bg-modifier-hover"
      onClick={(e) => {
        e.preventDefault();
        window.open(embed.url, '_blank');
      }}
    >
      {embed.siteName && (
        <div className="mb-1 flex items-center gap-1.5">
          {embed.favicon && (
            <img src={embed.favicon} alt="" className="h-4 w-4 rounded-sm" />
          )}
          <span className="text-xs text-ec-text-muted">{embed.siteName}</span>
        </div>
      )}
      {embed.title && (
        <p className="text-sm font-semibold text-ec-text-link hover:underline">{embed.title}</p>
      )}
      {embed.description && (
        <p className="mt-1 line-clamp-3 text-sm text-ec-text-secondary">{embed.description}</p>
      )}
      {embed.imageUrl && (
        <img
          src={embed.imageUrl}
          alt=""
          className="mt-2 max-h-[200px] max-w-full rounded object-contain"
          loading="lazy"
        />
      )}
    </a>
  );
}
