package com.weiguang.energy.demo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.Enumeration;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import org.junit.Test;

/**
 * The vendor aar ships without its own dependencies. A class it links against and the app
 * does not package only fails when that code path first runs on the phone, as a
 * NoClassDefFoundError inside the SDK's Bluetooth callback.
 */
public class UteSdkLinkageTest {
    /** Custom watch-face bitmap conversion; needs the vendor's native aar and no band callback reaches it. */
    private static final String UNPACKAGED_PREFIX = "com/jieli/bmp_convert/";
    private static final String UNPACKAGED_CALLER = "com/yc/utesdk/watchface/close/uterkcase";

    @Test
    public void everyClassTheSdkLinksAgainstIsOnTheAppClasspath() throws Exception {
        Class<?> anchor = Class.forName("com.yc.utesdk.ble.open.UteBleClient");
        File jar = new File(anchor.getProtectionDomain().getCodeSource().getLocation().toURI());
        ClassLoader loader = getClass().getClassLoader();
        Map<String, Set<String>> missing = new TreeMap<>();
        int scanned = 0;
        try (JarFile file = new JarFile(jar)) {
            Enumeration<JarEntry> entries = file.entries();
            while (entries.hasMoreElements()) {
                JarEntry entry = entries.nextElement();
                if (!entry.getName().endsWith(".class")) {
                    continue;
                }
                scanned++;
                String owner = entry.getName().substring(0, entry.getName().length() - 6);
                try (InputStream in = file.getInputStream(entry)) {
                    for (String name : referencedClasses(in)) {
                        if (!resolves(name, loader)) {
                            missing.computeIfAbsent(name, key -> new TreeSet<>()).add(owner);
                        }
                    }
                }
            }
        }
        assertTrue("SDK jar was not scanned: " + jar, scanned > 300);
        Map<String, Set<String>> unexpected = new TreeMap<>();
        for (Map.Entry<String, Set<String>> entry : missing.entrySet()) {
            boolean known = entry.getKey().startsWith(UNPACKAGED_PREFIX)
                && entry.getValue().size() == 1
                && entry.getValue().contains(UNPACKAGED_CALLER);
            if (!known) {
                unexpected.put(entry.getKey(), entry.getValue());
            }
        }
        assertEquals("classes the SDK needs at runtime but the app does not package", "{}", unexpected.toString());
    }

    private static boolean resolves(String internalName, ClassLoader loader) {
        try {
            Class.forName(internalName.replace('/', '.'), false, loader);
            return true;
        } catch (ClassNotFoundException | LinkageError error) {
            return false;
        }
    }

    private static Set<String> referencedClasses(InputStream in) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        for (int read; (read = in.read(chunk)) > 0; ) {
            buffer.write(chunk, 0, read);
        }
        DataInputStream data = new DataInputStream(new java.io.ByteArrayInputStream(buffer.toByteArray()));
        data.skipBytes(8);
        int count = data.readUnsignedShort();
        String[] text = new String[count];
        int[] classIndex = new int[count];
        for (int i = 1; i < count; i++) {
            int tag = data.readUnsignedByte();
            switch (tag) {
                case 1:
                    text[i] = data.readUTF();
                    break;
                case 7:
                    classIndex[i] = data.readUnsignedShort();
                    break;
                case 8:
                case 16:
                case 19:
                case 20:
                    data.skipBytes(2);
                    break;
                case 15:
                    data.skipBytes(3);
                    break;
                case 3:
                case 4:
                case 9:
                case 10:
                case 11:
                case 12:
                case 17:
                case 18:
                    data.skipBytes(4);
                    break;
                case 5:
                case 6:
                    data.skipBytes(8);
                    i++;
                    break;
                default:
                    throw new IOException("constant pool tag " + tag);
            }
        }
        Set<String> names = new TreeSet<>();
        for (int i = 1; i < count; i++) {
            if (classIndex[i] == 0) {
                continue;
            }
            String name = text[classIndex[i]];
            while (name.startsWith("[")) {
                name = name.substring(1);
            }
            if (name.startsWith("L") && name.endsWith(";")) {
                name = name.substring(1, name.length() - 1);
            }
            if (name.length() > 1) {
                names.add(name);
            }
        }
        return names;
    }
}
