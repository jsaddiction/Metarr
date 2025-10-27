import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer, faUsers, faCog } from '@fortawesome/free-solid-svg-icons';
import { MediaPlayerGroup } from '../../types/mediaPlayer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MediaPlayerGroupCardProps {
  group: MediaPlayerGroup;
  onPlayerClick: (playerId: number) => void;
  onGroupSettingsClick: (groupId: number) => void;
  onAddPlayerToGroup: (groupId: number, groupName: string) => void;
}

export const MediaPlayerGroupCard: React.FC<MediaPlayerGroupCardProps> = ({
  group,
  onPlayerClick,
  onGroupSettingsClick,
  onAddPlayerToGroup,
}) => {
  const isSharedGroup = group.max_members === null || group.max_members > 1;
  const isKodi = group.type === 'kodi';
  const memberCount = group.members.length;

  // Kodi Shared MySQL Group - Compact with scrollable member list
  if (isKodi && isSharedGroup) {
    return (
      <Card className="hover:border-primary transition-colors">
        <CardContent className="p-4">
          {/* Compact Group Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <FontAwesomeIcon icon={faUsers} className="text-violet-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white truncate leading-tight">{group.name}</h3>
                <p className="text-xs text-neutral-500 leading-tight">
                  Shared MySQL • {memberCount} {memberCount === 1 ? 'member' : 'members'}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onGroupSettingsClick(group.id);
              }}
              className="flex-shrink-0 h-7 w-7 p-0 hover:bg-violet-500/10"
            >
              <FontAwesomeIcon icon={faCog} className="text-xs text-neutral-400 hover:text-violet-400" />
            </Button>
          </div>

          {/* Compact Scrollable Member List with shadcn ScrollArea */}
          <ScrollArea className="h-[108px] rounded-md border border-neutral-800 bg-neutral-900/50">
            <div className="p-1.5 space-y-0.5">
              {group.members.map((member) => (
                <div
                  key={member.id}
                  onClick={() => onPlayerClick(member.id)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded border border-transparent hover:border-violet-500/30 hover:bg-violet-500/5 cursor-pointer transition-all group"
                >
                  <FontAwesomeIcon
                    icon={faServer}
                    className="text-violet-400/70 text-sm flex-shrink-0 group-hover:text-violet-400"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs text-white font-medium truncate">{member.name}</span>
                      <span className="text-[10px] text-neutral-500 truncate flex-shrink-0">
                        {member.host}:{member.httpPort}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Player to Group Button - Quick action to add Kodi to this group */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddPlayerToGroup(group.id, group.name);
                }}
                className="w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded border border-dashed border-neutral-700 hover:border-violet-500/50 hover:bg-violet-500/5 cursor-pointer transition-all text-neutral-500 hover:text-violet-400"
              >
                <span className="text-sm">+</span>
                <span className="text-xs">Add Player to Group</span>
              </button>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  // Standalone Player - Very compact single card
  const player = group.members[0];
  if (!player) {
    return null;
  }

  return (
    <Card
      onClick={() => onPlayerClick(player.id)}
      className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faServer} className="text-primary-500 flex-shrink-0" />
          <div className="flex-1 min-w-0 leading-tight">
            <h3 className="text-sm font-semibold text-white truncate">{player.name}</h3>
            <p className="text-xs text-neutral-500 truncate">
              {group.type.charAt(0).toUpperCase() + group.type.slice(1)} • {player.host}:{player.httpPort}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
