"""
Simple test script to verify Sentry is working correctly.
Run this from the project root with: python -m api.test_sentry
Or from the api directory with: python test_sentry.py
"""
import os
import sys

# Get the directory of this script
script_dir = os.path.dirname(os.path.abspath(__file__))

# Add parent directory to path if needed (for imports from api/)
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

# Change to script directory to ensure relative imports work
os.chdir(script_dir)

# Import config to initialize Sentry
import config

# Try to import sentry_sdk
try:
    import sentry_sdk
    print("[OK] sentry_sdk imported successfully")
    
    # Check if Sentry is initialized (using new API)
    client = sentry_sdk.Hub.current.client
    if client:
        print("[OK] Sentry is initialized")
        # Get DSN from client options
        dsn = client.dsn
        # Mask DSN for security (only show first part)
        if dsn:
            dsn_masked = dsn.split('@')[0][:20] + '...' if '@' in dsn else '***'
            print(f"  DSN: {dsn_masked}")
        else:
            print("  DSN: Not set")
        environment = getattr(client, 'options', {}).get('environment', 'unknown')
        if hasattr(client, 'options') and hasattr(client.options, 'get'):
            environment = client.options.get('environment', 'unknown')
        else:
            environment = getattr(client, 'environment', 'unknown')
        print(f"  Environment: {environment}")
    else:
        print("[ERROR] Sentry is NOT initialized (no client found)")
        print("  Make sure SENTRY_DSN is set in your environment variables")
        sys.exit(1)
    
    # Test 1: Capture a test message
    print("\n[TEST] Sending test message to Sentry...")
    sentry_sdk.capture_message("Test message from Python API - Sentry is working!", level="info")
    print("[OK] Test message sent")
    
    # Test 2: Capture a test exception
    print("\n[TEST] Sending test exception to Sentry...")
    try:
        raise ValueError("Test exception for Sentry integration verification")
    except ValueError as e:
        sentry_sdk.capture_exception(e)
        print("[OK] Test exception sent")
    
    # Flush to ensure messages are sent
    print("\n[WAIT] Flushing Sentry queue...")
    sentry_sdk.flush(timeout=5)
    print("[OK] Flush complete")
    
    print("\n[SUCCESS] All tests passed! Check your Sentry dashboard to see the test messages.")
    print("   If you don't see them, verify:")
    print("   1. SENTRY_DSN is correctly set in your .env file")
    print("   2. The DSN is valid and has access to your Sentry project")
    print("   3. Your internet connection is working")
    
except ImportError:
    print("[ERROR] sentry_sdk not installed. Run: pip install sentry-sdk[fastapi]")
    sys.exit(1)
except Exception as e:
    print(f"[ERROR] Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
