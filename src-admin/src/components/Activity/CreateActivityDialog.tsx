import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Typography,
    Select,
    MenuItem,
    Box,
    Checkbox,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Chip,
} from '@mui/material';
import { I18n } from '@iobroker/adapter-react-v5';
import type { HarmonyDevice } from '../../types/harmony';
import { ACTIVITY_TYPE_MAP, getActivityIconSrc } from '../../utils/activityTypes';
import { getDeviceIconSrc } from '../../utils/deviceTypes';
import { HarmonyIcon } from '../Common/HarmonyIcon';

interface CreateActivityDialogProps {
    open: boolean;
    allDevices: HarmonyDevice[];
    onClose: () => void;
    onCreate: (def: { name: string; type: string; devices: Array<{ deviceId: string; role: string }> }) => void;
}

const ROLE_OPTIONS = [
    { value: '', label: 'No Role' },
    { value: 'VolumeActivityRole', label: 'Volume' },
    { value: 'DisplayActivityRole', label: 'Display' },
    { value: 'ChannelChangingActivityRole', label: 'Channel' },
    { value: 'PlayMovieActivityRole', label: 'Movie' },
    { value: 'PlayMusicActivityRole', label: 'Music' },
    { value: 'NavigationActivityRole', label: 'Navigation' },
    { value: 'TextEntryActivityRole', label: 'Text Entry' },
    { value: 'GamePlayingActivityRole', label: 'Gaming' },
];

export function CreateActivityDialog({ open, allDevices, onClose, onCreate }: CreateActivityDialogProps): React.JSX.Element {
    const [name, setName] = useState('');
    const [type, setType] = useState('VirtualTelevisionN');
    const [selectedDevices, setSelectedDevices] = useState<Record<string, string>>({});

    const activityTypes = Object.entries(ACTIVITY_TYPE_MAP)
        .filter(([key]) => key !== 'PowerOff')
        .map(([key, info]) => ({ key, label: info.label }));

    const toggleDevice = (deviceId: string): void => {
        setSelectedDevices((prev) => {
            if (deviceId in prev) {
                const next = { ...prev };
                delete next[deviceId];
                return next;
            }
            return { ...prev, [deviceId]: '' };
        });
    };

    const setRole = (deviceId: string, role: string): void => {
        setSelectedDevices((prev) => ({ ...prev, [deviceId]: role }));
    };

    const handleCreate = (): void => {
        const devices = Object.entries(selectedDevices).map(([deviceId, role]) => ({ deviceId, role }));
        onCreate({ name: name.trim() || 'New Activity', type, devices });
    };

    const canCreate = name.trim().length > 0 && Object.keys(selectedDevices).length > 0;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{I18n.t('createActivity')}</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    <TextField
                        label={I18n.t('name')}
                        value={name}
                        onChange={(e): void => setName(e.target.value)}
                        fullWidth
                        autoFocus
                    />

                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                            {I18n.t('type')}
                        </Typography>
                        <Select
                            value={type}
                            onChange={(e): void => setType(e.target.value)}
                            fullWidth
                            size="small"
                        >
                            {activityTypes.map((at) => (
                                <MenuItem key={at.key} value={at.key}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <HarmonyIcon src={getActivityIconSrc(at.key)} alt={at.label} size={24} />
                                        {at.label}
                                    </Box>
                                </MenuItem>
                            ))}
                        </Select>
                    </Box>

                    <Box>
                        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                            {I18n.t('devices')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {I18n.t('selectDevicesForActivity')}
                        </Typography>
                        <List dense disablePadding sx={{ maxHeight: 300, overflow: 'auto' }}>
                            {allDevices.map((dev) => {
                                const isSelected = dev.id in selectedDevices;
                                return (
                                    <ListItem
                                        key={dev.id}
                                        disablePadding
                                        sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}
                                    >
                                        <Checkbox
                                            checked={isSelected}
                                            onChange={(): void => toggleDevice(dev.id)}
                                            size="small"
                                        />
                                        <ListItemIcon sx={{ minWidth: 36 }}>
                                            <HarmonyIcon src={getDeviceIconSrc(dev.type)} alt={dev.label} size={28} />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={dev.label}
                                            secondary={`${dev.manufacturer} ${dev.model}`}
                                            primaryTypographyProps={{ fontSize: 13 }}
                                            secondaryTypographyProps={{ fontSize: 11 }}
                                            sx={{ flex: 1 }}
                                        />
                                        {isSelected && (
                                            <Select
                                                value={selectedDevices[dev.id]}
                                                onChange={(e): void => setRole(dev.id, e.target.value)}
                                                size="small"
                                                sx={{ minWidth: 120 }}
                                                displayEmpty
                                            >
                                                {ROLE_OPTIONS.map((r) => (
                                                    <MenuItem key={r.value} value={r.value}>
                                                        {r.label}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        )}
                                    </ListItem>
                                );
                            })}
                        </List>
                        {Object.keys(selectedDevices).length > 0 && (
                            <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                                {Object.entries(selectedDevices).map(([id, role]) => {
                                    const dev = allDevices.find((d) => d.id === id);
                                    return (
                                        <Chip
                                            key={id}
                                            label={`${dev?.label || id}${role ? ` (${ROLE_OPTIONS.find((r) => r.value === role)?.label || role})` : ''}`}
                                            size="small"
                                            onDelete={(): void => toggleDevice(id)}
                                        />
                                    );
                                })}
                            </Box>
                        )}
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{I18n.t('cancel')}</Button>
                <Button variant="contained" onClick={handleCreate} disabled={!canCreate}>
                    {I18n.t('createActivity')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
