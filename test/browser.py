"""Optional browser integration check: python test/browser.py.

Requires Python packages playwright and Pillow, and Chromium.
All reports/codes used here are synthetic; the real .data directory is untouched.
"""
import os
import socket
import subprocess
import tempfile
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='flota-browser-') as data:
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    sock.close()
    env = {**os.environ, 'DATA_DIR': data, 'PORT': str(port),
           'DRIVER_ACCESS_CODE': 'browser-driver-test', 'ADMIN_ACCESS_CODE': 'browser-admin-test'}
    server = subprocess.Popen(['node', 'server.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, text=True)
    try:
        assert 'portul' in server.stdout.readline(), 'Server did not start'
        photo = Path(data) / 'sample.jpg'
        Image.new('RGB', (900, 600), (110, 145, 100)).save(photo)
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 1440, 'height': 1000})
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{port}')
            page.locator('#access-code').fill('browser-driver-test')
            page.locator('#login-form button').click()
            expect(page.locator('h1')).to_have_text('Bună! Hai să verificăm camionul.')
            page.evaluate('navigator.serviceWorker.ready.then(() => true)')
            page.wait_for_function('!!navigator.serviceWorker.controller')
            page.screenshot(path='/tmp/flota-dashboard.png', full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            page.locator('#new-inspection').click()
            context.set_offline(True)
            page.locator('[name=driver]').fill('Șofer offline test')
            page.locator('[name=truck]').fill('CJ 10 ABC')
            page.locator('[name=trailer]').fill('CJ 20 DEF')
            slots = ['cabina', 'bord', 'fata', 'spate', 'stanga', 'dreapta', 'remorcaExterior', 'remorcaInterior']
            for index, slot in enumerate(slots):
                page.locator(f'[data-photo={slot}]').set_input_files(photo)
                expect(page.locator('#photo-progress')).to_have_text(f'{index + 1} / 8')
            page.locator('[name=condition][value=damage]').check()
            page.locator('[name=notes]').fill('Lampă remorcă deteriorată — verificare necesară.')
            expect(page.locator('#save-status')).to_contain_text('Progres salvat')
            page.reload()
            expect(page.locator('h1')).to_have_text('Bună! Hai să verificăm camionul.')
            page.locator('#continue-inspection').click()
            expect(page.locator('#photo-progress')).to_have_text('8 / 8')
            expect(page.locator('[name=driver]')).to_have_value('Șofer offline test')
            expect(page.locator('[name=notes]')).to_have_value('Lampă remorcă deteriorată — verificare necesară.')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile layout overflows'
            page.screenshot(path='/tmp/flota-inspection-mobile.png', full_page=True)
            page.locator('#submit-report').click()
            expect(page.locator('h1')).to_have_text('Rapoartele mele')
            expect(page.locator('.sync-label')).to_contain_text('Așteaptă trimiterea')
            page.reload()
            page.locator('[data-view=history]').click()
            expect(page.locator('tbody tr')).to_have_count(1)
            expect(page.locator('.sync-label')).to_contain_text('Așteaptă trimiterea')
            context.set_offline(False)
            page.locator('#sync-now').click()
            expect(page.locator('.sync-label')).to_have_text('✓ Trimis', timeout=15000)
            page.locator('#sync-now').click()
            expect(page.locator('tbody tr')).to_have_count(1)
            admin = browser.new_context(viewport={'width': 1440, 'height': 1000})
            admin_page = admin.new_page()
            admin_page.on('pageerror', lambda error: errors.append(str(error)))
            admin_page.goto(f'http://127.0.0.1:{port}')
            admin_page.locator('#access-code').fill('browser-admin-test')
            admin_page.locator('#login-form button').click()
            expect(admin_page.locator('h1')).to_have_text('Flota, sub control.')
            expect(admin_page.locator('tbody tr')).to_have_count(1)
            admin_page.locator('[data-report]').click()
            expect(admin_page.locator('#report-dialog')).to_be_visible()
            expect(admin_page.locator('#report-detail img')).to_have_count(8)
            expect(admin_page.locator('.report-notes')).to_contain_text('Lampă remorcă deteriorată')
            admin_page.locator('#close-dialog').click()
            admin_page.locator('[data-view=vehicles]').click()
            admin_page.locator('[name=plate]').fill('B 99 XYZ')
            admin_page.locator('#vehicle-form button').click()
            expect(admin_page.locator('.vehicle-list')).to_contain_text('B 99 XYZ')
            admin_page.locator('[data-view=overview]').click()
            expect(admin_page.locator('.attention')).to_contain_text('B 99 XYZ')
            admin_page.screenshot(path='/tmp/flota-admin.png', full_page=True)
            assert not errors, f'Browser errors: {errors}'
            browser.close()
        print('PASS: mobile layout, offline draft reload, 8 photos, offline report reload, reconnect sync, no duplicates, administrator details and missing inspection.')
    finally:
        server.terminate()
        server.wait(timeout=10)
