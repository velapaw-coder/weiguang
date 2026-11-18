package com.weiguang.energy.core;

import java.util.List;
import java.util.Map;

public interface SqlSession {
    void exec(String sql, Object... args);

    List<Map<String, Object>> query(String sql, Object... args);

    void transaction(Runnable work);
}
