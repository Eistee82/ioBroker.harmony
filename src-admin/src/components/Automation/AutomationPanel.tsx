import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Card, CardContent, Switch, Slider,
    FormControlLabel, CircularProgress, Alert, IconButton, Tooltip,
} from '@mui/material';
import Grid2 from '@mui/material/Grid2';
import RefreshIcon from '@mui/icons-material/Refresh';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import { I18n } from '@iobroker/adapter-react-v5';

interface AutomationDevice {
    id: string;
    on: boolean;
    brightness?: number;
    color?: { mode?: string; temp?: number };
    status?: number;
}

interface AutomationPanelProps {
    hubName: string;
    sendCommand: <T>(command: string, payload?: unknown) => Promise<{ success: boolean; data?: T; error?: string }>;
}

export function AutomationPanel({ hubName, sendCommand }: AutomationPanelProps): React.JSX.Element {
    const [devices, setDevices] = useState<AutomationDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadState = useCallback(async () => {
        setLoading(true);
        setError(null);
        const resp = await sendCommand<Record<string, unknown>>('getAutomationState', { hubName });
        setLoading(false);
        if (resp.success && resp.data) {
            // Parse state object into device array
            const devs: AutomationDevice[] = [];
            const data = resp.data as Record<string, Record<string, unknown>>;
            for (const [id, state] of Object.entries(data)) {
                if (typeof state === 'object' && state !== null) {
                    devs.push({
                        id,
                        on: !!state.on,
                        brightness: typeof state.brightness === 'number' ? state.brightness : undefined,
                        color: state.color as AutomationDevice['color'],
                        status: typeof state.status === 'number' ? state.status : undefined,
                    });
                }
            }
            setDevices(devs);
        } else {
            setError(resp.error || 'Failed to load automation state');
        }
    }, [hubName, sendCommand]);

    useEffect(() => { void loadState(); }, [loadState]);

    const handleToggle = useCallback(async (deviceId: string, on: boolean) => {
        await sendCommand('setAutomationState', { hubName, deviceId, state: { on } });
        setDevices((prev) => prev.map((d) => d.id === deviceId ? { ...d, on } : d));
    }, [hubName, sendCommand]);

    const handleBrightness = useCallback(async (deviceId: string, brightness: number) => {
        await sendCommand('setAutomationState', { hubName, deviceId, state: { on: true, brightness } });
        setDevices((prev) => prev.map((d) => d.id === deviceId ? { ...d, on: true, brightness } : d));
    }, [hubName, sendCommand]);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
                <CircularProgress size={24} />
                <Typography>{I18n.t('loading')}</Typography>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">{I18n.t('homeAutomation')}</Typography>
                <Tooltip title={I18n.t('refresh')}>
                    <IconButton onClick={(): void => { void loadState(); }}>
                        <RefreshIcon />
                    </IconButton>
                </Tooltip>
            </Box>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {devices.length === 0 && !error && (
                <Typography variant="body2" color="text.secondary">
                    {I18n.t('noAutomationDevices')}
                </Typography>
            )}
            <Grid2 container spacing={2}>
                {devices.map((dev) => {
                    const friendlyName = dev.id.replace(/_/g, ' ').replace(/^hue-light\./, '');
                    return (
                        <Grid2 key={dev.id} size={{ xs: 12, sm: 6, md: 4 }}>
                            <Card variant="outlined">
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <LightbulbIcon color={dev.on ? 'warning' : 'disabled'} />
                                        <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
                                            {friendlyName}
                                        </Typography>
                                    </Box>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={dev.on}
                                                onChange={(_, checked): void => { void handleToggle(dev.id, checked); }}
                                            />
                                        }
                                        label={dev.on ? 'On' : 'Off'}
                                    />
                                    {dev.brightness !== undefined && (
                                        <Box sx={{ px: 1, mt: 1 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                {I18n.t('brightness')}: {Math.round(dev.brightness / 254 * 100)}%
                                            </Typography>
                                            <Slider
                                                value={dev.brightness}
                                                min={0}
                                                max={254}
                                                onChange={(_, val): void => { void handleBrightness(dev.id, val as number); }}
                                                size="small"
                                                disabled={!dev.on}
                                            />
                                        </Box>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid2>
                    );
                })}
            </Grid2>
        </Box>
    );
}
