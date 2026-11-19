package com.weiguang.energy.core;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Real SQLite through sqlite-jdbc. Used to test the same SQL the phone runs. */
public final class JdbcSession implements SqlSession, AutoCloseable {
    private final Connection connection;

    public JdbcSession(String path) {
        try {
            connection = DriverManager.getConnection("jdbc:sqlite:" + path);
            connection.setAutoCommit(true);
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        }
    }

    @Override
    public void exec(String sql, Object... args) {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bind(statement, args);
            statement.execute();
        } catch (SQLException ex) {
            throw new IllegalStateException(sql, ex);
        }
    }

    @Override
    public List<Map<String, Object>> query(String sql, Object... args) {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bind(statement, args);
            try (ResultSet rs = statement.executeQuery()) {
                List<Map<String, Object>> rows = new ArrayList<>();
                ResultSetMetaData meta = rs.getMetaData();
                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    for (int i = 1; i <= meta.getColumnCount(); i++) {
                        row.put(meta.getColumnLabel(i), rs.getObject(i));
                    }
                    rows.add(row);
                }
                return rows;
            }
        } catch (SQLException ex) {
            throw new IllegalStateException(sql, ex);
        }
    }

    @Override
    public void transaction(Runnable work) {
        try {
            connection.setAutoCommit(false);
            work.run();
            connection.commit();
        } catch (RuntimeException | SQLException ex) {
            try {
                connection.rollback();
            } catch (SQLException ignored) {
                // The original failure is the one that matters.
            }
            if (ex instanceof RuntimeException) {
                throw (RuntimeException) ex;
            }
            throw new IllegalStateException(ex);
        } finally {
            try {
                connection.setAutoCommit(true);
            } catch (SQLException ex) {
                throw new IllegalStateException(ex);
            }
        }
    }

    @Override
    public void close() {
        try {
            connection.close();
        } catch (SQLException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static void bind(PreparedStatement statement, Object[] args) throws SQLException {
        for (int i = 0; i < args.length; i++) {
            if (args[i] == null) {
                statement.setObject(i + 1, null);
            } else {
                statement.setObject(i + 1, args[i]);
            }
        }
    }
}
