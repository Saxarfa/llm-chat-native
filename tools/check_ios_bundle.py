"""Fail the build on extension targets, restricted entitlements or missing assets."""
import argparse
import plistlib
from pathlib import Path

FORBIDDEN = {'aps-environment', 'com.apple.developer.icloud-services',
             'com.apple.developer.applesignin', 'com.apple.security.application-groups',
             'com.apple.developer.associated-domains'}

def check(root: Path, built: bool):
    assert not list(root.rglob('*.appex')), 'App extensions are not allowed'
    assert not list(root.rglob('*.mobileprovision')), 'Provisioning must be supplied by iloader'
    for path in root.rglob('*.entitlements'):
        keys = plistlib.loads(path.read_bytes()).keys()
        assert not FORBIDDEN.intersection(keys), 'Paid capability found'
        assert not any('icloud' in k or 'ubiquity' in k for k in keys), 'iCloud capability found'
    if built:
        info = plistlib.loads((root / 'Info.plist').read_bytes())
        assert info['CFBundleIdentifier'] == 'app.llmchat.capacitor'
        for key in ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSLocalNetworkUsageDescription']:
            assert info.get(key), key
        assert (root / 'App').is_file(), 'Missing executable'
        assert (root / 'public/index.html').is_file(), 'Missing bundled UI'
        assert (root / 'public/js/storage.js').is_file(), 'Missing storage manager'
        assert not (root / '_CodeSignature').exists(), 'Expected an unsigned app'
    else:
        project = (root / 'App/App.xcodeproj/project.pbxproj').read_text()
        assert 'com.apple.product-type.app-extension' not in project
        assert project.count('productType = "com.apple.product-type.application"') == 1
        assert 'SystemCapabilities' not in project
    print('iOS bundle checks passed')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--source', type=Path)
    group.add_argument('--app', type=Path)
    args = parser.parse_args()
    check(args.app or args.source, bool(args.app))
